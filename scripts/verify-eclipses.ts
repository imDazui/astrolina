// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verify the Eclipses overlay's mathematics (src/lib/astro/eclipsePath.ts and
// src/lib/astro/lunarEclipse.ts) against NASA/GSFC published eclipse data —
// the same modules the browser runs, driven here through a @swisseph/node
// adapter with the app's own .se1 files.
//
// Solar checks, per reference eclipse (fixtures quote eclipse.gsfc.nasa.gov
// SEdata pages, Eclipse Predictions by Fred Espenak and Jean Meeus, NASA/GSFC):
//   1. Swiss event search lands on the published instant and classification.
//   2. The cubic element fit matches direct ephemeris evaluation (<1e-4 ER).
//   3. Our Besselian elements match NASA's published polynomials (2024-04-08,
//      the one page that prints them) — x, y, d, l1, l2 and the equivalent of
//      μ, element by element.
//   4. The greatest-eclipse ground point lands on NASA's coordinates.
//   5. The umbral path width at greatest eclipse matches.
//   6. Local circumstances at the GE point reproduce the catalog magnitude.
//   7. The curve generators return sane shapes (central line, band, isolines).
//   8. Local contact times on the published central line reproduce NASA's
//      totality duration and mid-eclipse instant.
// Lunar checks, per reference eclipse (fixtures quote the Espenak "prime"
// pages — same canon as the Five Millennium Catalog):
//   1. normalizeSwissLunarEclipse undoes the wrapper's one-slot field shift:
//      every remapped contact lands on the published time, in order.
//   2. The sub-lunar point at maximum matches the published zenith coords.
//   3. The visibility polygon ring closes, contains the sub-lunar point and
//      excludes its antipode; per-place phase visibility behaves.
// Plus catalog integrity for both committed JSON catalogs (unique ids across
// the merged set, global chronology, Swiss spot-resolution) and a degenerate
// sweep building the visibility polygon across the whole lunar catalog.
//
// Run: npm run verify:eclipses   (tsx — the app modules are imported as-is)

import {
  setEphemerisPath,
  julianDay,
  calculatePosition,
  calculateHouses,
  findNextSolarEclipse,
  findNextLunarEclipse,
  CalculationFlag,
  EclipseType,
  HouseSystem,
  Planet,
} from '@swisseph/node';
import {
  computeElements,
  centralLine,
  umbralLimits,
  magnitudeIsolines,
  greatestEclipsePoint,
  localCircumstances,
  localContacts,
  normalizeSwissEclipse,
  umbralPathWidthKm,
  type BesselianElements,
  type EclipseEphemeris,
} from '../src/lib/astro/eclipsePath';
import { normalizeSwissLunarEclipse } from '../src/lib/astro/eclipseAdapter';
import {
  lunarGeometry,
  lunarLocalView,
  type LunarEclipseGeometry,
} from '../src/lib/astro/lunarEclipse';
import catalog from '../src/lib/astro/data/solarEclipses.json';
import lunarCatalog from '../src/lib/astro/data/lunarEclipses.json';

setEphemerisPath(process.cwd() + '/public/ephe');

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

// ── Node-side ephemeris adapter (mirrors ephemeris.ts sunMoonEquatorial) ──────
const FLAG_EQ =
  CalculationFlag.SwissEphemeris | CalculationFlag.Speed | CalculationFlag.Equatorial;

const nodeEphemeris: EclipseEphemeris = {
  sunMoon(jdUT: number) {
    const sun = calculatePosition(jdUT, Planet.Sun, FLAG_EQ);
    const moon = calculatePosition(jdUT, Planet.Moon, FLAG_EQ);
    const gast =
      calculateHouses(jdUT, 0, 0, HouseSystem.WholeSign).armc * DEG2RAD;
    return {
      sunRa: sun.longitude * DEG2RAD,
      sunDec: sun.latitude * DEG2RAD,
      sunDistAu: sun.distance,
      moonRa: moon.longitude * DEG2RAD,
      moonDec: moon.latitude * DEG2RAD,
      moonDistAu: moon.distance,
      gast,
    };
  },
};

// ── Tiny assertion harness ────────────────────────────────────────────────────
let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  if (ok) {
    console.log(`  ok   ${label}  (${detail})`);
  } else {
    failures++;
    console.error(`  FAIL ${label}  (${detail})`);
  }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371.0;
  const p1 = lat1 * DEG2RAD, p2 = lat2 * DEG2RAD;
  const h =
    Math.sin(((p2 - p1) / 2)) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(((lng2 - lng1) * DEG2RAD) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ── Reference eclipses ────────────────────────────────────────────────────────
// All values from the per-eclipse pages at
// https://eclipse.gsfc.nasa.gov/SEsearch/SEdata.php?Ecl=YYYYMMDD
// GE coordinates there are printed to 0.1° (≈ up to 8 km of quantization).
interface Fixture {
  id: string;
  kind: 'total' | 'annular' | 'hybrid' | 'partial';
  /** Greatest eclipse, UT: [y, m, d, h, min, s]. */
  geUT: [number, number, number, number, number, number];
  geLat: number;
  geLng: number;
  widthKm: number | null;
  magnitude: number;
}

const FIXTURES: Fixture[] = [
  { id: '2024-04-08', kind: 'total',   geUT: [2024, 4, 8, 18, 17, 15],  geLat: 25.3,  geLng: -104.1, widthKm: 197.5, magnitude: 1.0566 },
  { id: '2017-08-21', kind: 'total',   geUT: [2017, 8, 21, 18, 25, 30], geLat: 37.0,  geLng: -87.7,  widthKm: 114.7, magnitude: 1.0306 },
  { id: '2023-10-14', kind: 'annular', geUT: [2023, 10, 14, 17, 59, 27], geLat: 11.4, geLng: -83.1,  widthKm: 187.4, magnitude: 0.9520 },
  { id: '2026-08-12', kind: 'total',   geUT: [2026, 8, 12, 17, 45, 51], geLat: 65.2,  geLng: -25.2,  widthKm: 293.9, magnitude: 1.0386 },
  { id: '2018-02-15', kind: 'partial', geUT: [2018, 2, 15, 20, 51, 22], geLat: -71.0, geLng: 0.6,    widthKm: null,  magnitude: 0.5991 },
];

// NASA's published Besselian polynomials for 2024-04-08 (SEdata.php page),
// t in TDT hours from 18:00:00 TDT, ΔT = 74.0 s. μ and d in degrees.
const NASA_2024 = {
  t0TDT: julianDay(2024, 4, 8, 18),
  deltaT: 74.0,
  x: [-0.318244, 0.5117116, 0.0000326, -0.0000084],
  y: [0.219764, 0.2709589, -0.0000595, -0.0000047],
  d: [7.5862002, 0.014844, -0.000002, 0],
  l1: [0.535814, 0.0000618, -0.0000128, 0],
  l2: [-0.010272, 0.0000615, -0.0000127, 0],
  mu: [89.591217, 15.00408, 0, 0],
};
const poly = (c: number[], t: number) => c[0] + t * (c[1] + t * (c[2] + t * c[3]));

function swissKind(typeFlags: number): Fixture['kind'] {
  if (typeFlags & EclipseType.AnnularTotal) return 'hybrid';
  if (typeFlags & EclipseType.Total) return 'total';
  if (typeFlags & EclipseType.Annular) return 'annular';
  return 'partial';
}

function verifyFixture(fx: Fixture) {
  console.log(`\n${fx.id} (${fx.kind})`);
  const [y, m, d, hh, mm, ss] = fx.geUT;
  const geJd = julianDay(y, m, d, hh + mm / 60 + ss / 3600);
  const ev = findNextSolarEclipse(geJd - 2, CalculationFlag.SwissEphemeris, 0, false);

  check('classification', swissKind(ev.type) === fx.kind, swissKind(ev.type));
  const dtSec = Math.abs(ev.maximum - geJd) * 86400;
  check('greatest-eclipse instant', dtSec < 60, `Δ ${dtSec.toFixed(1)} s`);

  const el = computeElements(nodeEphemeris, normalizeSwissEclipse(ev));

  // 2. Fit vs direct evaluation across the window.
  let worstXY = 0, worstL = 0;
  for (let i = 0; i <= 20; i++) {
    const t = el.tPartial[0] + ((el.tPartial[1] - el.tPartial[0]) * i) / 20;
    const a = el.at(t);
    const b = el.atDirect(t);
    worstXY = Math.max(worstXY, Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    worstL = Math.max(worstL, Math.abs(a.l1 - b.l1), Math.abs(a.l2 - b.l2));
  }
  check('cubic fit (x, y)', worstXY < 1e-4, `worst ${worstXY.toExponential(1)} ER`);
  check('cubic fit (l1, l2)', worstL < 1e-5, `worst ${worstL.toExponential(1)} ER`);

  // 4. Greatest-eclipse ground point.
  const ge = greatestEclipsePoint(el);
  const geKm = haversineKm(ge.lat, ge.lng, fx.geLat, fx.geLng);
  check(
    'greatest-eclipse point',
    geKm < 25,
    `${ge.lat.toFixed(2)}°, ${ge.lng.toFixed(2)}° — ${geKm.toFixed(1)} km off NASA`,
  );

  // 5. Umbral path width at the GE instant.
  if (fx.widthKm !== null) {
    const w = umbralPathWidthKm(el, (ge.jd - el.jd0) * 24);
    check(
      'path width at GE',
      w !== null && Math.abs(w - fx.widthKm) < 6,
      `${w?.toFixed(1)} km vs NASA ${fx.widthKm} km`,
    );
  }

  // 6. Local circumstances at the GE point reproduce the catalog magnitude.
  const lc = localCircumstances(el, fx.geLat, fx.geLng);
  check(
    'local magnitude at GE',
    lc !== null && Math.abs(lc.magnitude - fx.magnitude) < 0.004,
    `${lc?.magnitude.toFixed(4)} vs NASA ${fx.magnitude}`,
  );

  // 7. Curve generators return sane shapes.
  const central = centralLine(el);
  const { limits, band } = umbralLimits(el);
  const isos = magnitudeIsolines(el, 25);
  if (fx.kind === 'partial') {
    check('no central line (partial)', central.length === 0, `${central.length} segments`);
    check('no umbral limits (partial)', limits.length === 0, `${limits.length} segments`);
    const expected = Math.floor((fx.magnitude * 100) / 25);
    check(
      'isoline family',
      isos.length === expected,
      `magnitudes [${isos.map((i) => i.magnitude).join(', ')}]`,
    );
  } else {
    const points = central.reduce((s, seg) => s + seg.length, 0);
    check('central line', central.length >= 1 && points > 150, `${central.length} segment(s), ${points} points`);
    check('umbral band ring', band !== null, `${limits.length} limit segment(s)`);
    check('isoline family', isos.length === 3, `magnitudes [${isos.map((i) => i.magnitude).join(', ')}]`);
    // The central line must thread between the limits: spot-check that its
    // midpoint sits within a path-width of both limit curves.
    if (band) {
      const mid = central[0][Math.floor(central[0].length / 2)];
      const near = limits.some((seg) =>
        seg.some(([lng, lat]) => haversineKm(lat, lng, mid[1], mid[0]) < 400),
      );
      check('central line inside band', near, 'midpoint near limits');
    }
  }
  return el;
}

// 3. Element-by-element comparison with NASA's published Besselian polynomials.
// Tolerances reflect convention differences, not bugs: NASA's canon uses the
// JPL DE405 ephemeris and slightly different light-time/aberration handling
// than Swiss's apparent positions, which moves x/y by a few × 1e-4 ER (≈ a
// few km on the ground — confirmed independently by the greatest-eclipse and
// path-width checks above landing on NASA's coordinates).
function verifyNasaElements(el: BesselianElements) {
  console.log('\n2024-04-08 — Besselian elements vs NASA polynomials');
  const worst = { x: 0, y: 0, d: 0, l1: 0, l2: 0, mu: 0 };
  for (let i = -2; i <= 2; i++) {
    const jdUT = NASA_2024.t0TDT + i / 24 - NASA_2024.deltaT / 86400;
    const t = (jdUT - el.jd0) * 24;
    const ours = el.at(t);
    worst.x = Math.max(worst.x, Math.abs(ours.x - poly(NASA_2024.x, i)));
    worst.y = Math.max(worst.y, Math.abs(ours.y - poly(NASA_2024.y, i)));
    worst.d = Math.max(worst.d, Math.abs(ours.d * RAD2DEG - poly(NASA_2024.d, i)));
    worst.l1 = Math.max(worst.l1, Math.abs(ours.l1 - poly(NASA_2024.l1, i)));
    worst.l2 = Math.max(worst.l2, Math.abs(ours.l2 - poly(NASA_2024.l2, i)));
    // We never form μ (Greenwich hour angle of the axis), but GAST − a IS μ —
    // up to the canon's EPHEMERIS-MERIDIAN convention: its μ is tabulated
    // against the TDT argument as if it were the rotation clock, i.e. it is
    // the hour angle ΔT of sidereal rotation ahead of the true Greenwich
    // value. Evaluating our GAST at t + ΔT reproduces it.
    const gastAtTdt = el.at(t + NASA_2024.deltaT / 3600).gast;
    const ourMu = ((gastAtTdt - ours.a) * RAD2DEG + 720) % 360;
    const nasaMu = ((poly(NASA_2024.mu, i) % 360) + 360) % 360;
    const dMu = Math.abs(((ourMu - nasaMu + 540) % 360) - 180);
    worst.mu = Math.max(worst.mu, dMu);
  }
  check('x', worst.x < 1e-3, `worst Δ ${worst.x.toExponential(2)} ER`);
  check('y', worst.y < 1e-3, `worst Δ ${worst.y.toExponential(2)} ER`);
  check('d', worst.d < 1e-3, `worst Δ ${worst.d.toExponential(2)} °`);
  check('l1', worst.l1 < 1e-4, `worst Δ ${worst.l1.toExponential(2)} ER`);
  check('l2', worst.l2 < 1e-4, `worst Δ ${worst.l2.toExponential(2)} ER`);
  check('μ (gast − a, ephem. meridian)', worst.mu < 3e-3, `worst Δ ${worst.mu.toExponential(2)} °`);
}

// ── Degenerate / polar regression checks ──────────────────────────────────────
function verifyEdgeCases() {
  console.log('\nedge cases');
  // 1935-01-05 (gamma −1.5381, magnitude 0.0013): Swiss returns ZEROED contact
  // slots for this barely-grazing partial; normalizeSwissEclipse must
  // synthesize a window instead of letting the sampler run off to JD 0.
  const grazing = findNextSolarEclipse(
    julianDay(1935, 1, 3, 0),
    CalculationFlag.SwissEphemeris,
    0,
    false,
  );
  const gn = normalizeSwissEclipse(grazing);
  check(
    '1935-01-05 window synthesized',
    gn.partialBegin > gn.maximum - 1 && gn.partialEnd < gn.maximum + 1,
    `±${(((gn.partialEnd - gn.partialBegin) / 2) * 24).toFixed(1)} h`,
  );
  const gel = computeElements(nodeEphemeris, gn);
  const gge = greatestEclipsePoint(gel);
  const glc = localCircumstances(gel, gge.lat, gge.lng);
  check(
    '1935-01-05 resolves end-to-end',
    glc !== null && glc.magnitude > 0 && glc.magnitude < 0.01,
    `GE ${gge.lat.toFixed(1)}°, ${gge.lng.toFixed(1)}° — mag ${glc?.magnitude.toFixed(4)}`,
  );

  // 2021-06-10 (Arctic annular): the umbral path winds around the pole, so the
  // band ring cannot be represented as a planar polygon — it must be rejected
  // (limit polylines still draw) rather than filled as a hemisphere streak.
  const arctic = findNextSolarEclipse(
    julianDay(2021, 6, 8, 0),
    CalculationFlag.SwissEphemeris,
    0,
    false,
  );
  const ael = computeElements(nodeEphemeris, normalizeSwissEclipse(arctic));
  const { limits, band } = umbralLimits(ael);
  check('2021-06-10 pole-winding band rejected', band === null, `${limits.length} limit segment(s) kept`);
  check('2021-06-10 central line still drawn', centralLine(ael).length >= 1, 'present');
}

// ── Solar local contact times ─────────────────────────────────────────────────
// Reference: the NASA path table for 2024-04-08 (SEpath2001/SE2024Apr08Tpath),
// central line at 18:42 UT = 32°17.0′N 96°42.0′W, totality 04m22.7s. A point
// ON the central line must reproduce that duration with mid-totality at the
// listed instant; a city outside the path (Chicago) must get C1/C4 only.
function verifyLocalContacts(el: BesselianElements) {
  console.log('\n2024-04-08 — local contact times');
  const onCenter = localContacts(el, 32 + 17.0 / 60, -(96 + 42.0 / 60));
  const midRef = julianDay(2024, 4, 8, 18.7); // 18:42:00 UT
  if (!onCenter || !onCenter.c2 || !onCenter.c3) {
    check('central-line point sees totality', false, 'c2/c3 missing');
  } else {
    check('central kind', onCenter.centralKind === 'total', `${onCenter.centralKind}`);
    const dur = onCenter.centralDurationSec!;
    check('totality duration', Math.abs(dur - 262.7) < 10, `${dur.toFixed(1)} s vs NASA 262.7 s`);
    const mid = (onCenter.c2.jd + onCenter.c3.jd) / 2;
    check(
      'mid-totality instant',
      Math.abs(mid - midRef) * 86400 < 60,
      `Δ ${(Math.abs(mid - midRef) * 86400).toFixed(1)} s`,
    );
    check(
      'contact order',
      onCenter.c1!.jd < onCenter.c2.jd &&
        onCenter.c2.jd < onCenter.max.jd &&
        onCenter.max.jd < onCenter.c3.jd &&
        onCenter.c3.jd < onCenter.c4!.jd,
      'c1 < c2 < max < c3 < c4',
    );
    check(
      'no horizon truncation',
      !onCenter.c1!.atHorizon && !onCenter.c4!.atHorizon,
      'geometric contacts',
    );
  }
  const chicago = localContacts(el, 41.88, -87.63);
  check(
    'off-path city: partial only',
    chicago !== null && chicago.c2 === null && chicago.c3 === null,
    `centralKind ${chicago?.centralKind}`,
  );
  if (chicago) {
    const spanH = (chicago.c4!.jd - chicago.c1!.jd) * 24;
    check(
      'off-path partial window sane',
      chicago.c1!.jd < chicago.max.jd &&
        chicago.max.jd < chicago.c4!.jd &&
        spanH > 1.5 &&
        spanH < 3.5,
      `${spanH.toFixed(2)} h`,
    );
  }
}

// ── Lunar eclipses ────────────────────────────────────────────────────────────
// Contact times from the Espenak prime pages (UT1; Swiss differs by its own
// ΔT model and shadow-enlargement convention — ≤ ~1 min on umbral contacts).
interface LunarFixture {
  id: string;
  kind: 'total' | 'partial' | 'penumbral';
  /** [y, m, d] to seed the search. */
  seed: [number, number, number];
  /** Published contacts, UT decimal hours; null = phase absent. */
  contacts: Record<'P1' | 'U1' | 'U2' | 'max' | 'U3' | 'U4' | 'P4', number | null>;
  zenLat: number;
  zenLng: number;
}

const h = (hh: number, mm: number, ss: number) => hh + mm / 60 + ss / 3600;
const LUNAR_FIXTURES: LunarFixture[] = [
  {
    id: '2025-03-14', kind: 'total', seed: [2025, 3, 12],
    contacts: {
      P1: h(3, 57, 9), U1: h(5, 9, 23), U2: h(6, 25, 58), max: h(6, 58, 45),
      U3: h(7, 32, 2), U4: h(8, 48, 19), P4: h(10, 0, 32),
    },
    zenLat: 2.68, zenLng: -102.24,
  },
  {
    id: '2024-09-18', kind: 'partial', seed: [2024, 9, 16],
    contacts: {
      P1: h(0, 40, 58), U1: h(2, 12, 42), U2: null, max: h(2, 44, 14),
      U3: null, U4: h(3, 16, 22), P4: h(4, 47, 54),
    },
    zenLat: -2.59, zenLng: -42.05,
  },
  {
    id: '2023-05-05', kind: 'penumbral', seed: [2023, 5, 3],
    contacts: {
      P1: h(15, 13, 39), U1: null, U2: null, max: h(17, 22, 54),
      U3: null, U4: null, P4: h(19, 31, 54),
    },
    zenLat: -17.24, zenLng: 98.05,
  },
];

function swissLunarKind(typeFlags: number): LunarFixture['kind'] {
  if (typeFlags & EclipseType.Total) return 'total';
  if (typeFlags & EclipseType.Partial) return 'partial';
  return 'penumbral';
}

// Even-odd test against an unwrapped ring, with the point's longitude brought
// into the ring's (possibly > 360°-wide) domain.
function pointInRing(ring: [number, number][], lat: number, lng: number): boolean {
  const min = Math.min(...ring.map((p) => p[0]));
  let x = lng;
  while (x < min) x += 360;
  while (x >= min + 360) x -= 360;
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const [x1, y1] = ring[i - 1];
    const [x2, y2] = ring[i];
    if (y1 > lat !== y2 > lat && x < x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1)) {
      inside = !inside;
    }
  }
  return inside;
}

function verifyLunarFixture(fx: LunarFixture): LunarEclipseGeometry {
  console.log(`\n${fx.id} (lunar ${fx.kind})`);
  const [y, m, d] = fx.seed;
  const raw = findNextLunarEclipse(
    julianDay(y, m, d, 0),
    CalculationFlag.SwissEphemeris,
    0,
    false,
  );
  check('classification', swissLunarKind(raw.type) === fx.kind, swissLunarKind(raw.type));
  const ev = normalizeSwissLunarEclipse(raw);
  const got: Record<string, number | null> = {
    P1: ev.penumbralBegin, U1: ev.partialBegin, U2: ev.totalBegin, max: ev.maximum,
    U3: ev.totalEnd, U4: ev.partialEnd, P4: ev.penumbralEnd,
  };
  const dayJd = Math.floor(got.max! - 0.5) + 0.5; // midnight UT of the eclipse day
  let worstSec = 0;
  for (const tag of Object.keys(fx.contacts) as (keyof LunarFixture['contacts'])[]) {
    const ref = fx.contacts[tag];
    if (ref === null) {
      check(`${tag} absent`, got[tag] === null, `${got[tag]}`);
      continue;
    }
    if (got[tag] === null) {
      check(`${tag} present`, false, 'missing');
      continue;
    }
    const sec = Math.abs(got[tag]! - (dayJd + ref / 24)) * 86400;
    worstSec = Math.max(worstSec, sec);
    check(`${tag} contact`, sec < 120, `Δ ${sec.toFixed(0)} s`);
  }
  const ordered = (['P1', 'U1', 'U2', 'max', 'U3', 'U4', 'P4'] as const)
    .map((tag) => got[tag])
    .filter((v): v is number => v !== null);
  check(
    'contacts in order',
    ordered.every((v, i) => i === 0 || v > ordered[i - 1]),
    `worst Δ ${worstSec.toFixed(0)} s`,
  );

  const geo = lunarGeometry(nodeEphemeris, ev);
  const zenKm = haversineKm(geo.sublunar.lat, geo.sublunar.lng, fx.zenLat, fx.zenLng);
  check(
    'sub-lunar point at maximum',
    zenKm < 60,
    `${geo.sublunar.lat.toFixed(2)}°, ${geo.sublunar.lng.toFixed(2)}° — ${zenKm.toFixed(0)} km off published`,
  );
  const ring = geo.visPolygon;
  check(
    'visibility ring closes',
    ring.length > 100 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1],
    `${ring.length} vertices`,
  );
  check(
    'sub-lunar inside / antipode outside',
    pointInRing(ring, geo.sublunar.lat, geo.sublunar.lng) &&
      !pointInRing(ring, -geo.sublunar.lat, geo.sublunar.lng + 180),
    'even-odd test',
  );
  const expectedCurves = fx.kind === 'penumbral' ? ['P1', 'P4'] : ['U1', 'U4'];
  check(
    'drawn horizon curves',
    geo.contactHorizons.map((c) => c.phase).join(',') === expectedCurves.join(','),
    geo.contactHorizons.map((c) => c.phase).join(','),
  );
  return geo;
}

function verifyLunarLocalView(geo: LunarEclipseGeometry) {
  console.log('\n2025-03-14 — per-place visibility');
  // Mexico City: the whole eclipse runs near local midnight, Moon up throughout.
  const cdmx = lunarLocalView(nodeEphemeris, geo, 19.43, -99.13);
  check(
    'Mexico City sees every phase',
    cdmx !== null && cdmx.phases.every((p) => p.visible),
    `${cdmx?.phases.filter((p) => p.visible).length}/${cdmx?.phases.length} visible`,
  );
  check(
    'Mexico City: no mid-eclipse horizon crossing',
    cdmx !== null && cdmx.moonrise === null && cdmx.moonset === null,
    'moon up throughout',
  );
  // Helsinki: maximum at 08:58 local with the Moon already set — it catches
  // the early penumbral/partial phases only, with moonset mid-eclipse.
  const helsinki = lunarLocalView(nodeEphemeris, geo, 60.17, 24.94);
  check(
    'Helsinki: partial view with moonset',
    helsinki !== null &&
      helsinki.phases.some((p) => p.visible) &&
      helsinki.phases.some((p) => !p.visible) &&
      helsinki.moonset !== null,
    helsinki
      ? `${helsinki.phases.filter((p) => p.visible).length}/${helsinki.phases.length} visible`
      : 'null',
  );
  // Perth: the Moon is below the horizon for the entire eclipse.
  check('Perth sees nothing', lunarLocalView(nodeEphemeris, geo, -31.95, 115.86) === null, 'null');
}

// Build the visibility polygon across the whole lunar catalog (every ~60th
// row) — catches sub-lunar degeneracies (equatorial declination, dateline).
function verifyLunarSweep() {
  console.log('\nlunar catalog sweep');
  const rows = lunarCatalog.rows as (string | number | null)[][];
  let worst = '';
  let bad = 0;
  for (let i = 0; i < rows.length; i += 59) {
    const id = rows[i][0] as string;
    const [y, m, d] = id.split('-').map(Number);
    const raw = findNextLunarEclipse(
      julianDay(y, m, d, 0) - 1.5,
      CalculationFlag.SwissEphemeris,
      0,
      false,
    );
    const geo = lunarGeometry(nodeEphemeris, normalizeSwissLunarEclipse(raw));
    const ring = geo.visPolygon;
    const closes =
      ring.length > 100 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1];
    if (!closes || !pointInRing(ring, geo.sublunar.lat, geo.sublunar.lng)) {
      bad++;
      worst = id;
    }
  }
  check('visibility polygons across catalog', bad === 0, bad ? `${bad} bad, e.g. ${worst}` : `${Math.ceil(rows.length / 59)} sampled`);
}

// ── Catalog integrity ─────────────────────────────────────────────────────────
function verifyCatalog() {
  console.log('\nsolarEclipses.json');
  const rows = catalog.rows as (string | number | null)[][];
  check('row count', rows.length > 1400, `${rows.length} rows`);
  const ids = rows.map((r) => r[0] as string);
  check('ids unique', new Set(ids).size === ids.length, `${ids.length} ids`);
  const sorted = [...ids].sort();
  check('ids sorted', ids.every((id, i) => id === sorted[i]), 'chronological');
  // Spot-check that every ~70th row resolves to a Swiss eclipse on its date.
  let worst = 0;
  for (let i = 0; i < rows.length; i += 71) {
    const id = rows[i][0] as string;
    const [y, m, d] = id.split('-').map(Number);
    const jd = julianDay(y, m, d, 0);
    const ev = findNextSolarEclipse(jd - 1.5, CalculationFlag.SwissEphemeris, 0, false);
    worst = Math.max(worst, Math.abs(ev.maximum - (jd + 0.5)));
  }
  check('rows resolve via Swiss', worst < 1.0, `worst |Δ| ${worst.toFixed(2)} d`);

  console.log('\nlunarEclipses.json');
  const lrows = lunarCatalog.rows as (string | number | null)[][];
  check('row count', lrows.length > 1400, `${lrows.length} rows`);
  const lids = lrows.map((r) => r[0] as string);
  check('ids unique', new Set(lids).size === lids.length, `${lids.length} ids`);
  const lsorted = [...lids].sort();
  check('ids sorted', lids.every((id, i) => id === lsorted[i]), 'chronological');
  let lworst = 0;
  for (let i = 0; i < lrows.length; i += 71) {
    const id = lrows[i][0] as string;
    const [y, m, d] = id.split('-').map(Number);
    const jd = julianDay(y, m, d, 0);
    const ev = findNextLunarEclipse(jd - 1.5, CalculationFlag.SwissEphemeris, 0, false);
    lworst = Math.max(lworst, Math.abs(ev.maximum - (jd + 0.5)));
  }
  check('rows resolve via Swiss', lworst < 1.0, `worst |Δ| ${lworst.toFixed(2)} d`);

  // The merged picker keys selection by id alone, so no date may appear in
  // both catalogs (physically guaranteed — New vs Full Moon are ≥ ~14 days
  // apart — but the loader's correctness rests on it, so assert it).
  console.log('\nmerged catalog');
  const all = new Set([...ids, ...lids]);
  check(
    'ids unique across both catalogs',
    all.size === ids.length + lids.length,
    `${all.size} combined ids`,
  );
}

// ── Run ───────────────────────────────────────────────────────────────────────
let el2024: BesselianElements | null = null;
for (const fx of FIXTURES) {
  const el = verifyFixture(fx);
  if (fx.id === '2024-04-08') el2024 = el;
}
if (el2024) {
  verifyNasaElements(el2024);
  verifyLocalContacts(el2024);
}
verifyEdgeCases();
let lunar2025: LunarEclipseGeometry | null = null;
for (const fx of LUNAR_FIXTURES) {
  const geo = verifyLunarFixture(fx);
  if (fx.id === '2025-03-14') lunar2025 = geo;
}
if (lunar2025) verifyLunarLocalView(lunar2025);
verifyLunarSweep();
verifyCatalog();

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
