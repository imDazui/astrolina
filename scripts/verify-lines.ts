// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the astrocartography LINE GEOMETRY of the real src/lib code (run via
// the harness: `npm run verify:lines`). The app draws an ASC line through every
// place where a body sits on the eastern horizon at the chart instant — so the
// checks here ask the sky directly, through routes independent of the line
// algebra under test:
//   1. on-horizon: every ASC/DSC vertex has geocentric altitude 0 (vector form);
//   2. rising vs setting: the altitude of the charted point is INCREASING along
//      ASC lines and decreasing along DSC lines (finite difference in time —
//      a sign error here would swap rising/setting lines app-wide);
//   3. Swiss's own rise/transit/set finder (swe_rise_trans, geometric horizon,
//      disc center) reproduces the chart instant at points on the lines;
//   4. polyline faithfulness: how far segment midpoints stray off the true
//      curve (sampling sag), and continuity across the DEC_EPS tracing switch;
//   5. zenith stamps, the ±180° seam, geodetic-mode identities, relocated
//      angles vs Robert Hand's closed-form ASC/MC, and the polar-latitude
//      behavior of every supported house system.
// Conventions verified: geometric horizon (no refraction), geocentric body
// centers, apparent positions + apparent sidereal time, of-date frame.
import { createRequire } from 'node:module';
import {
  birthDataToJD,
  eclipticLonOfRA,
  eclipticToRaDec,
  gmstRadians,
  getPlanetPositions,
  initEphemeris,
  obliquity,
  projectOntoEcliptic,
  raDecToEclipticLon,
  relocate,
  type HouseSystem,
  type PlanetName,
  type PlanetPosition,
} from '../src/lib/ephemeris';
import { generateLines, generateZenithStamps, normLng, type MeridianLng } from '../src/lib/astro/lines';
import type { BirthData } from '../src/lib/birthData';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const node: any = createRequire(import.meta.url)('@swisseph/node');

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
// swe_rise_trans event bits: geometric horizon (no refraction), body center.
const BIT_DISC_CENTER = 256;
const BIT_NO_REFRACTION = 512;
const GEOMETRIC = BIT_DISC_CENTER | BIT_NO_REFRACTION;

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}
const fmt = (x: number) => x.toExponential(2);

// ── Independent oracle helpers ────────────────────────────────────────────────
// Greenwich apparent sidereal time straight from Swiss (armc at Greenwich) —
// the same data source the app reads, but none of the app's code.
const gastCache = new Map<number, number>();
function gastRad(jd: number): number {
  let v = gastCache.get(jd);
  if (v === undefined) {
    v = node.calculateHouses(jd, 0, 0, node.HouseSystem.WholeSign).armc * DEG2RAD;
    gastCache.set(jd, v!);
  }
  return v!;
}

// Geocentric altitude of a fixed equatorial direction (ra, dec) seen from a
// place, in VECTOR form: the dot product of the observer's zenith direction and
// the body direction has no hour-angle sign convention to inherit a bug from.
function altitudeOf(jd: number, ra: number, dec: number, latDeg: number, lngDeg: number): number {
  const theta = gastRad(jd) + lngDeg * DEG2RAD; // local apparent sidereal time
  const phi = latDeg * DEG2RAD;
  const dot =
    Math.cos(phi) * Math.cos(theta) * Math.cos(dec) * Math.cos(ra) +
    Math.cos(phi) * Math.sin(theta) * Math.cos(dec) * Math.sin(ra) +
    Math.sin(phi) * Math.sin(dec);
  return Math.asin(Math.max(-1, Math.min(1, dot)));
}

// d(altitude)/dt of the charted (frozen) position — pure Earth rotation, the
// motion that decides whether a charted point is on the RISING or SETTING side.
function altSlope(jd: number, ra: number, dec: number, latDeg: number, lngDeg: number): number {
  const dt = 30 / 86400;
  return (
    (altitudeOf(jd + dt, ra, dec, latDeg, lngDeg) - altitudeOf(jd - dt, ra, dec, latDeg, lngDeg)) /
    (2 * dt)
  );
}

// The Swiss rise/transit/set event nearest the chart instant (search starts a
// bit more than one event period back, then walks forward past jd).
function nearestEvent(
  jd: number,
  bodyId: number,
  eventBits: number,
  lngDeg: number,
  latDeg: number,
): number | null {
  let t = jd - 1.1;
  let best: number | null = null;
  for (let i = 0; i < 6; i++) {
    const r = node.calculateRiseTransitSet(t, bodyId, eventBits, lngDeg, latDeg, 0);
    if (!Number.isFinite(r.time)) break;
    if (best === null || Math.abs(r.time - jd) < Math.abs(best - jd)) best = r.time;
    if (r.time > jd) break;
    t = r.time + 1e-4;
  }
  return best;
}

await initEphemeris();

const birth = (
  name: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tzOffset: number,
  lat = 0,
  lng = 0,
): BirthData => ({
  name,
  year,
  month,
  day,
  hour,
  minute,
  tzOffset,
  birthplace: { label: name, lat, lng },
});

// Battery: the seed chart, a high-declination Moon (2025 major lunar standstill
// window — asserted below, not assumed), the Sun within hours of an equinox
// (exercises the DEC_EPS near-zero-declination tracing path), and J2000.
const CHARTS: BirthData[] = [
  birth('Jim Lewis (seed chart)', 1941, 6, 5, 9, 30, -4, 40.9312, -73.8988),
  birth('standstill Moon', 2025, 3, 7, 18, 0, 0),
  birth('equinox Sun', 2024, 3, 20, 3, 7, 0),
  birth('J2000', 2000, 1, 1, 12, 0, 0),
];

// Bodies that exercise every code path: luminaries, an inner and outer planet,
// the highest-ecliptic-latitude body (Pluto), and both nodes (SouthNode is the
// app-derived antipode, not a Swiss body).
const BODY_SET: PlanetName[] = ['Sun', 'Moon', 'Venus', 'Saturn', 'Pluto', 'NorthNode', 'SouthNode'];
const SWISS_ID: Partial<Record<PlanetName, number>> = {
  Sun: node.Planet.Sun,
  Moon: node.Planet.Moon,
  Venus: node.Planet.Venus,
  Saturn: node.Planet.Saturn,
  Pluto: node.Planet.Pluto,
};

// ── 1–4. Per-chart line geometry ──────────────────────────────────────────────
for (const b of CHARTS) {
  const jd = birthDataToJD(b);
  const gmst = gmstRadians(jd);
  const meridianLng: MeridianLng = (raM) => ((raM - gmst) * 180) / Math.PI; // App.tsx celestial recipe
  const all = getPlanetPositions(jd, 'mean');
  const positions = all.filter((p) => BODY_SET.includes(p.name));
  const lines = generateLines(positions, meridianLng);
  const byBody = new Map(positions.map((p) => [p.name, p]));

  if (b.name === 'standstill Moon') {
    const moon = byBody.get('Moon');
    check(
      `${b.name}: Moon |dec| > 25° (standstill battery is meaningful)`,
      !!moon && Math.abs(moon.dec) * RAD2DEG > 25,
      moon ? `dec=${(moon.dec * RAD2DEG).toFixed(2)}°` : 'Moon missing',
    );
  }

  let maxVertexAlt = 0; // on-curve altitude (algebraic consistency)
  let maxSagDeg = 0; // chord-midpoint altitude (what the user actually sees)
  let dirViolations = 0;
  let dirChecked = 0;

  for (const f of lines.features) {
    const { planet, lineType } = f.properties;
    const p = byBody.get(planet)!;
    if (lineType !== 'ASC' && lineType !== 'DSC') continue;
    const coords = f.geometry.coordinates as [number, number][];
    const turnLat = 90 - Math.abs(p.dec) * RAD2DEG; // circumpolar boundary

    for (let i = 0; i < coords.length; i++) {
      const [lng, lat] = coords[i];
      const alt = Math.abs(altitudeOf(jd, p.ra, p.dec, lat, lng));
      if (alt > maxVertexAlt) maxVertexAlt = alt;

      // Sampling sag: evaluate the chord midpoint of each segment against the
      // true horizon. This is the real on-map placement error of the polyline.
      if (i > 0) {
        const [lng0, lat0] = coords[i - 1];
        const midAlt = Math.abs(
          altitudeOf(jd, p.ra, p.dec, (lat0 + lat) / 2, (lng0 + lng) / 2),
        );
        if (midAlt * RAD2DEG > maxSagDeg) maxSagDeg = midAlt * RAD2DEG;
      }

      // Rising/setting direction, away from the turning latitude where the
      // altitude rate legitimately passes through zero.
      if (i % 5 === 0 && Math.abs(lat) < turnLat - 2 && Math.abs(lat) <= 84) {
        dirChecked += 1;
        const slope = altSlope(jd, p.ra, p.dec, lat, lng);
        const wantRising = lineType === 'ASC';
        if ((slope > 0) !== wantRising) dirViolations += 1;
      }
    }
  }

  check(`${b.name}: ASC/DSC vertices on the horizon`, maxVertexAlt < 1e-9, `max |alt| ${fmt(maxVertexAlt)} rad`);
  check(`${b.name}: sampling sag < 0.05°`, maxSagDeg < 0.05, `max midpoint off-horizon ${maxSagDeg.toFixed(4)}°`);
  check(
    `${b.name}: rising on ASC / setting on DSC (${dirChecked} pts)`,
    dirChecked > 50 && dirViolations === 0,
    `${dirViolations} violation(s)`,
  );

  // Swiss's own event finder at mid-latitude line points: a place on the rise
  // line must see the body rise AT the chart instant (geometric, disc-center;
  // residual = topocentric parallax, seconds for planets — Moon checked via the
  // altitude oracle above instead, its ~57′ parallax shifts swe_rise_trans).
  for (const name of ['Sun', 'Venus', 'Saturn'] as PlanetName[]) {
    const p = byBody.get(name);
    if (!p) continue;
    const id = SWISS_ID[name]!;
    for (const side of ['ASC', 'DSC'] as const) {
      const f = lines.features.find(
        (x) => x.properties.planet === name && x.properties.lineType === side,
      )!;
      const v = (f.geometry.coordinates as [number, number][])
        .filter(([, lat]) => Math.abs(lat) < 55)
        .filter((_, i) => i % 23 === 0)
        .slice(0, 3);
      let worst = 0;
      for (const [lng, lat] of v) {
        const bits = (side === 'ASC' ? node.RiseTransitFlag.Rise : node.RiseTransitFlag.Set) | GEOMETRIC;
        const t = nearestEvent(jd, id, bits, normLng(lng), lat);
        const dSec = t === null ? Infinity : Math.abs(t - jd) * 86400;
        if (dSec > worst) worst = dSec;
      }
      check(`${b.name}: swe_rise_trans agrees on ${name} ${side}`, worst < 15, `worst Δ ${worst.toFixed(1)}s`);
    }

    // MC/IC: upper/lower transit instant at a point on the meridian line.
    const mcF = lines.features.find((x) => x.properties.planet === name && x.properties.lineType === 'MC')!;
    const mcLng = (mcF.geometry.coordinates as [number, number][])[0][0];
    const tUp = nearestEvent(jd, id, node.RiseTransitFlag.UpperTransit, normLng(mcLng), 40);
    check(
      `${b.name}: ${name} MC longitude culminates at chart instant`,
      tUp !== null && Math.abs(tUp - jd) * 86400 < 10,
      `Δ ${tUp === null ? 'none' : ((tUp - jd) * 86400).toFixed(1)}s`,
    );
    const icF = lines.features.find((x) => x.properties.planet === name && x.properties.lineType === 'IC')!;
    const icLng = (icF.geometry.coordinates as [number, number][])[0][0];
    const tLo = nearestEvent(jd, id, node.RiseTransitFlag.LowerTransit, normLng(icLng), 40);
    check(
      `${b.name}: ${name} IC longitude anti-culminates at chart instant`,
      tLo !== null && Math.abs(tLo - jd) * 86400 < 10,
      `Δ ${tLo === null ? 'none' : ((tLo - jd) * 86400).toFixed(1)}s`,
    );
  }

  // Zenith stamps: the body stands exactly overhead. Measured as the angle
  // between the zenith and body unit vectors via atan2(|cross|, dot) — asin of
  // the dot product is ill-conditioned this close to 90° altitude.
  const stamps = generateZenithStamps(positions, meridianLng);
  let worstZenith = 0;
  for (const s of stamps.features) {
    const p = byBody.get(s.properties.planet)!;
    const [lng, lat] = s.geometry.coordinates;
    const theta = gastRad(jd) + lng * DEG2RAD;
    const phi = lat * DEG2RAD;
    const z = [Math.cos(phi) * Math.cos(theta), Math.cos(phi) * Math.sin(theta), Math.sin(phi)];
    const v = [Math.cos(p.dec) * Math.cos(p.ra), Math.cos(p.dec) * Math.sin(p.ra), Math.sin(p.dec)];
    const cross = [
      z[1] * v[2] - z[2] * v[1],
      z[2] * v[0] - z[0] * v[2],
      z[0] * v[1] - z[1] * v[0],
    ];
    const sep = Math.atan2(Math.hypot(...cross), z[0] * v[0] + z[1] * v[1] + z[2] * v[2]);
    if (sep > worstZenith) worstZenith = sep;
  }
  check(`${b.name}: zenith stamps directly under the body`, worstZenith < 1e-9, `max Δ ${fmt(worstZenith)} rad`);
}

// ── 5. DEC_EPS tracing-switch continuity ──────────────────────────────────────
// The tracer switches algorithms at |tan dec| = 0.05 (hour-angle sweep above,
// latitude sweep below). The two must describe the same curve: compare the
// longitudes they produce at matched latitudes for declinations a hair on
// either side of the threshold.
{
  const gmst = 1.234;
  const meridianLng: MeridianLng = (raM) => ((raM - gmst) * 180) / Math.PI;
  const mk = (dec: number): PlanetPosition => ({ name: 'Sun', ra: 2.1, dec });
  for (const sgn of [1, -1]) {
    const below = generateLines([mk(sgn * Math.atan(0.0499))], meridianLng);
    const above = generateLines([mk(sgn * Math.atan(0.0501))], meridianLng);
    for (const side of ['ASC', 'DSC'] as const) {
      const cb = below.features.find((f) => f.properties.lineType === side)!.geometry.coordinates as [number, number][];
      const ca = above.features.find((f) => f.properties.lineType === side)!.geometry.coordinates as [number, number][];
      // Interpolate each curve's longitude at shared latitudes (both monotonic
      // in latitude away from the apex; near-vertical here, apex off-map).
      const lngAtLat = (coords: [number, number][], lat: number): number | null => {
        for (let i = 1; i < coords.length; i++) {
          const [g0, l0] = coords[i - 1];
          const [g1, l1] = coords[i];
          if ((l0 <= lat && lat <= l1) || (l1 <= lat && lat <= l0)) {
            const t = l1 === l0 ? 0 : (lat - l0) / (l1 - l0);
            return g0 + (g1 - g0) * t;
          }
        }
        return null;
      };
      let worst = 0;
      for (let lat = -80; lat <= 80; lat += 5) {
        const ga = lngAtLat(ca, lat);
        const gb = lngAtLat(cb, lat);
        if (ga === null || gb === null) continue;
        const d = Math.abs(normLng(ga - gb));
        if (d > worst) worst = d;
      }
      check(
        `DEC_EPS switch continuity (${side}, dec ${sgn > 0 ? '+' : '-'})`,
        worst < 0.1,
        `max Δlng ${worst.toFixed(4)}°`,
      );
    }
  }
}

// ── 6. ±180° seam ─────────────────────────────────────────────────────────────
// Drive a synthetic body's lines across the antimeridian; after the tracer's
// unwrap, consecutive longitudes must never jump more than 180°.
{
  const gmst = 0;
  const meridianLng: MeridianLng = (raM) => ((raM - gmst) * 180) / Math.PI;
  const p: PlanetPosition = { name: 'Sun', ra: 179.7 * DEG2RAD, dec: 18 * DEG2RAD };
  const lines = generateLines([p], meridianLng);
  let worstJump = 0;
  for (const f of lines.features) {
    const coords = f.geometry.coordinates as [number, number][];
    for (let i = 1; i < coords.length; i++) {
      const d = Math.abs(coords[i][0] - coords[i - 1][0]);
      if (d > worstJump) worstJump = d;
    }
  }
  check('seam: no >180° longitude jump after unwrap', worstJump <= 180, `max |Δlng| ${worstJump.toFixed(2)}°`);
  check('seam: normLng(-180) → +180', normLng(-180) === 180, `got ${normLng(-180)}`);
}

// ── 7. Geodetic-mode identities ───────────────────────────────────────────────
{
  const jd = birthDataToJD(CHARTS[3]);
  const eps = obliquity(jd);
  // eclipticLonOfRA must be the exact inverse of RA(λ, lat 0).
  let worstInv = 0;
  let counterDiffers = false;
  for (let lonDeg = 0; lonDeg < 360; lonDeg += 0.5) {
    const lam = lonDeg * DEG2RAD;
    const { ra } = eclipticToRaDec(lam, 0, eps);
    const back = eclipticLonOfRA(ra, eps);
    const d = Math.abs(Math.atan2(Math.sin(back - lam), Math.cos(back - lam)));
    if (d > worstInv) worstInv = d;
    // The source NOTE says raDecToEclipticLon(ra, 0, eps) is NOT the inverse —
    // confirm the two formulas genuinely disagree somewhere.
    const wrong = raDecToEclipticLon(ra, 0, eps);
    if (Math.abs(Math.atan2(Math.sin(wrong - lam), Math.cos(wrong - lam))) > 1e-3) counterDiffers = true;
  }
  check('geodetic: eclipticLonOfRA inverts RA(λ,0)', worstInv < 1e-12, `max Δ ${fmt(worstInv)} rad`);
  check('geodetic: raDecToEclipticLon(ra,0,ε) is a different function (NOTE holds)', counterDiffers);

  // Full path: in geodetic mode the Sun's MC line longitude IS its zodiacal
  // longitude (Greenwich = 0° Aries, Sepharial's geodetic equivalents).
  const geodeticLng: MeridianLng = (raM) => (eclipticLonOfRA(raM, eps) * 180) / Math.PI;
  const proj = projectOntoEcliptic(getPlanetPositions(jd, 'mean'), jd);
  const sun = proj.find((p) => p.name === 'Sun')!;
  const lines = generateLines([sun], geodeticLng);
  const mcLng = (lines.features.find((f) => f.properties.lineType === 'MC')!.geometry.coordinates as [number, number][])[0][0];
  const sunEclDeg = raDecToEclipticLon(sun.ra, sun.dec, eps) * RAD2DEG;
  check(
    'geodetic: Sun MC line at Sun zodiacal longitude',
    Math.abs(normLng(mcLng - sunEclDeg)) < 1e-9,
    `Δ ${fmt(Math.abs(normLng(mcLng - sunEclDeg)))}°`,
  );
}

// ── 8. relocate() vs Robert Hand's closed-form ASC/MC ─────────────────────────
// An independent textbook formulation (Hand, Essays on Astrology ch. 12):
//   MC  = atan2(sin RAMC, cos RAMC · cos ε)
//   Asc = atan2(cos RAMC, −(sin RAMC · cos ε + tan φ · sin ε))
// both quadrant-correct, with RAMC = GAST + geographic longitude.
{
  const jd = birthDataToJD(CHARTS[0]);
  const eps = obliquity(jd);
  const gmst = gmstRadians(jd);
  let worstMc = 0;
  let worstAsc = 0;
  for (const lat of [-60, -45, -23.5, 0, 23.5, 45, 60]) {
    for (const lng of [-150, -75, 0, 75, 150]) {
      const ramc = gmst + lng * DEG2RAD;
      const mcHand = Math.atan2(Math.sin(ramc), Math.cos(ramc) * Math.cos(eps));
      const ascHand = Math.atan2(
        Math.cos(ramc),
        -(Math.sin(ramc) * Math.cos(eps) + Math.tan(lat * DEG2RAD) * Math.sin(eps)),
      );
      const h = relocate(jd, lat, lng, 'placidus');
      const dMc = Math.abs(Math.atan2(Math.sin(h.mc - mcHand), Math.cos(h.mc - mcHand)));
      const dAsc = Math.abs(Math.atan2(Math.sin(h.asc - ascHand), Math.cos(h.asc - ascHand)));
      if (dMc > worstMc) worstMc = dMc;
      if (dAsc > worstAsc) worstAsc = dAsc;
    }
  }
  check('relocate MC matches Hand closed form', worstMc < 1e-6, `max Δ ${fmt(worstMc)} rad`);
  check('relocate ASC matches Hand closed form', worstAsc < 1e-6, `max Δ ${fmt(worstAsc)} rad`);
}

// ── 9. Polar-latitude behavior of every supported house system ────────────────
// Above the polar circles, quadrant systems degrade or fail (Hand ch. 12). The
// app must never crash on a polar relocation, whatever Swiss returns. This
// section characterizes (prints) and asserts only survivability + finiteness.
{
  const jd = birthDataToJD(CHARTS[0]);
  const gmst = gmstRadians(jd);
  // A longitude that puts the local RAMC at Hand's 280° test value.
  const lng80 = normLng((280 * DEG2RAD - gmst) * RAD2DEG);
  const systems: HouseSystem[] = [
    'placidus', 'koch', 'regiomontanus', 'campanus', 'porphyry', 'alcabitus', 'equal', 'whole',
  ];
  for (const sys of systems) {
    let outcome: string;
    let finite = true;
    try {
      const h = relocate(jd, 80, lng80, sys);
      finite = [h.asc, h.mc, ...h.cusps].every(Number.isFinite);
      const ascDeg = (h.asc * RAD2DEG).toFixed(2);
      const mcDeg = (h.mc * RAD2DEG).toFixed(2);
      outcome = `asc ${ascDeg}° mc ${mcDeg}°`;
    } catch (e) {
      outcome = `THROWS: ${(e as Error).message}`;
    }
    console.log(`  polar 80°N RAMC 280° [${sys}] ${outcome}`);
    check(`polar: relocate(80°N, ${sys}) survives with finite angles`, !outcome.startsWith('THROWS') && finite, outcome);
  }
  // Sweep the whole sidereal day at 80°N under Placidus — the system Swiss
  // documents as undefined there. Whatever the wrapper does must hold app-wide,
  // and every fallback must be FLAGGED (the wheel shows a caution from it).
  let throws = 0;
  let unflagged = 0;
  for (let ramcDeg = 0; ramcDeg < 360; ramcDeg += 15) {
    const lng = normLng((ramcDeg * DEG2RAD - gmst) * RAD2DEG);
    try {
      const h = relocate(jd, 80, lng, 'placidus');
      if (![h.asc, h.mc, ...h.cusps].every(Number.isFinite)) throws += 1;
      if (!h.fallback) unflagged += 1;
    } catch {
      throws += 1;
    }
  }
  check('polar: Placidus RAMC sweep at 80°N never crashes', throws === 0, `${throws}/24 failures`);
  check('polar: every Porphyry fallback carries the flag', unflagged === 0, `${unflagged}/24 unflagged`);
  // ...and a mid-latitude chart must NOT be flagged.
  check('mid-latitude Placidus is not flagged as fallback', !relocate(jd, 48.4, 9.99, 'placidus').fallback);
}

console.log(failures === 0 ? '\nverify-lines: ALL PASS' : `\nverify-lines: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
