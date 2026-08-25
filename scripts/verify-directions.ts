// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the TIME-OVERLAY and RELATIONSHIP math of the real src/lib code (run
// via the harness: `npm run verify:directions`): progression clocks, solar-arc
// and primary-direction arcs and frames, transit framing, synastry framing, and
// the Davison midpoints. Each assertion pins either a textbook identity (the
// day-for-a-year ratio, solar-arc-in-longitude's directed MC = natal MC + arc, the
// bi-wheel's RAMC+arc directed angles) or a deliberate design equivalence (primary
// directions' MAP lines as a rigid rotation ≡ advancing the RAMC), so any future
// change of convention has to be made knowingly.
import { createRequire } from 'node:module';
import {
  birthDataToJD,
  directedAngles,
  getAngleCoords,
  getPlanetPositions,
  gmstRadians,
  initEphemeris,
  obliquity,
  raDecToEclipticLon,
  eclipticLonOfRA,
  eclipticToRaDec,
  relocate,
} from '../src/lib/ephemeris';
import type { HouseSystem } from '../src/lib/ephemeris';
import { buildOverlay, epochMsToJD, jdToEpochMs, normalizeAngle } from '../src/lib/astro/timeline';
import type { AngleProgression } from '../src/lib/astro/timeline';
import { buildDavison } from '../src/lib/astro/relationship';
import { generateLines, type MeridianLng } from '../src/lib/astro/lines';
import type { BirthData } from '../src/lib/birthData';
import type { StoredChart } from '../src/lib/chartLibrary';
import type { TFn } from '../src/i18n';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const node: any = createRequire(import.meta.url)('@swisseph/node');

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const ARCSEC = 1 / 3600;
const TROPICAL_YEAR_DAYS = 365.2422;
const TROPICAL_MONTH_DAYS = 27.321582;

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}
const t = ((key: string) => key) as unknown as TFn;
const dAng = (a: number, b: number) => Math.abs(normalizeAngle(a - b));

await initEphemeris();

const stored = (b: BirthData): StoredChart => ({ ...b, id: 'verify', createdAt: 0 });
const CHART = stored({
  name: 'Jim Lewis',
  year: 1941, month: 6, day: 5, hour: 9, minute: 30, tzOffset: -4,
  birthplace: { label: 'Yonkers', lat: 40.9312, lng: -73.8988 },
});
const PARTNER = stored({
  name: 'partner',
  year: 1990, month: 5, day: 15, hour: 6, minute: 0, tzOffset: 9,
  birthplace: { label: 'Tokyo', lat: 35.68, lng: 139.69 },
});

const birthJD = birthDataToJD(CHART);
const natalGmst = gmstRadians(birthJD);
const eps = obliquity(birthJD);
const natal = getPlanetPositions(birthJD, 'mean');
// Age ≈ 30: 30 tropical years after birth, in epoch ms.
const target = jdToEpochMs(birthJD + 30 * TROPICAL_YEAR_DAYS);
const targetJD = epochMsToJD(target);
const years = (targetJD - birthJD) / TROPICAL_YEAR_DAYS;

// ── 1. Progression clocks ─────────────────────────────────────────────────────
{
  const sec = buildOverlay(CHART, 'progressed', target, null, 'mean', 'mean-quotidian', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  const wantSec = birthJD + (targetJD - birthJD) / TROPICAL_YEAR_DAYS;
  check('secondary progressed JD: day per tropical year (365.2422)', Math.abs(sec.jd - wantSec) < 1e-9, `Δ ${(sec.jd - wantSec).toExponential(2)} d`);
  check('progressed default frame: natal RAMC held', dAng(sec.gmst, natalGmst) < 1e-12);
  const sunAtProg = getPlanetPositions(sec.jd, 'mean')[0];
  check('progressed positions are the real sky at the progressed instant', dAng(sec.positions[0].ra, sunAtProg.ra) < 1e-12);

  const ter = buildOverlay(CHART, 'progressed', target, null, 'mean', 'mean-quotidian', 'ptolemy', 1, 'relative-to-natal', 'tertiary', t)!;
  const wantTer = birthJD + (targetJD - birthJD) / TROPICAL_MONTH_DAYS;
  check('tertiary progressed JD: day per tropical month (27.321582)', Math.abs(ter.jd - wantTer) < 1e-9, `Δ ${(ter.jd - wantTer).toExponential(2)} d`);

  // Angle-method variants frame the RAMC as documented.
  const naibod = buildOverlay(CHART, 'progressed', target, null, 'mean', 'naibod-ra', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  check('progressed naibod-ra: RAMC advanced 0.985647°/yr', dAng(naibod.gmst, natalGmst + 0.985647 * years * DEG2RAD) < 1e-12);
  const saRa = buildOverlay(CHART, 'progressed', target, null, 'mean', 'sa-ra', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  const arcRA = normalizeAngle(getPlanetPositions(wantSec, 'mean')[0].ra - natal[0].ra);
  check('progressed sa-ra: RAMC advanced by the solar arc in RA', dAng(saRa.gmst, natalGmst + arcRA) < 1e-12);

  // Bi-wheel angle coherence (June 2026 audit fix): the wheel's overlay-ring
  // angles seed from the NATAL moment (angleJd) and are directed by the same
  // arc/frame the map gmst uses. Previously the wheel showed true-quotidian
  // angles (~1°/yr drift) under every method, including "Natal Frame".
  check(
    'progressed default: wheel seeds natal angles, no direction applied',
    Math.abs((sec.angleJd ?? 0) - birthJD) < 1e-9 && sec.angleArc === undefined,
  );
  const saL = buildOverlay(CHART, 'progressed', target, null, 'mean', 'sa-long', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  const sunProgLon = raDecToEclipticLon(getPlanetPositions(wantSec, 'mean')[0].ra, getPlanetPositions(wantSec, 'mean')[0].dec, eps);
  const sunNatalLon = raDecToEclipticLon(natal[0].ra, natal[0].dec, eps);
  const arcLong = normalizeAngle(sunProgLon - sunNatalLon);
  const baseAng = relocate(birthJD, CHART.birthplace.lat, CHART.birthplace.lng, 'placidus');
  const saLDir = directedAngles(baseAng, birthJD, CHART.birthplace.lat, CHART.birthplace.lng, 'placidus', saL.angleArc, saL.angleFrame);
  // The MC is the ONLY angle a longitude arc advances directly: it is a point on
  // the ecliptic, so "the chart shifts in longitude" and "the meridian moves" are
  // the same sentence for it, and for nothing else.
  check(
    'progressed sa-long: directed MC advances by the arc in longitude',
    saL.angleFrame === 'long' && dAng(saLDir.mc, baseAng.mc + arcLong) < 1e-12,
  );
  // The Ascendant does NOT, and until 2026-08-24 this file asserted that it did —
  // `dAng(saLDir.asc, baseAng.asc + arcLong) < 1e-12`, pinning what the code was
  // doing. Solar Fire and Sirius both contradict it, and the app's own printed table
  // was internally inconsistent: it gave the directed Ascendant a right ascension no
  // Ascendant could have at this latitude. The Ascendant is not a linear function of
  // the RAMC, so adding the arc to its longitude names a point that does not rise
  // against the directed meridian — 15° away at age 85 here. It must be re-derived
  // from the RAMC that culminates the directed MC. (Lina's ruling, 24 Aug 2026.)
  const advRamc = eclipticToRaDec(normalizeAngle(baseAng.mc + arcLong), 0, eps).ra;
  const fromRamc = relocate(
    birthJD, CHART.birthplace.lat, ((advRamc - natalGmst) * 180) / Math.PI, 'placidus',
  );
  check(
    'progressed sa-long: directed ASC is derived from the directed MC, not arc-shifted',
    dAng(saLDir.asc, fromRamc.asc) < 1e-12,
    `the retired convention sits ${(dAng(baseAng.asc + arcLong, fromRamc.asc) * RAD2DEG).toFixed(2)}° away`,
  );

  // Cusps are part of the directed angle set, not leftovers from the natal one.
  // `directedAngles` used to omit them entirely, so every directed overlay carried a
  // directed Ascendant glued to twelve NATAL cusps. That is invisible on a quadrant
  // wheel except as a stray first-house spoke — but WheelSvg INFERS whole sign from
  // the cusps and anchors the wheel on cusps[0], so it drew the whole directed chart
  // on the natal rising sign.
  const QUADRANT: HouseSystem[] = ['placidus', 'koch', 'regiomontanus', 'campanus', 'porphyry'];
  for (const [name, layer] of [['sa-long', saL], ['sa-ra', saRa], ['naibod-ra', naibod]] as const) {
    let worstQ = 0;
    for (const sys of QUADRANT) {
      const b = relocate(birthJD, CHART.birthplace.lat, CHART.birthplace.lng, sys);
      const d = directedAngles(b, birthJD, CHART.birthplace.lat, CHART.birthplace.lng, sys, layer.angleArc, layer.angleFrame);
      worstQ = Math.max(
        worstQ,
        dAng(d.cusps[0], d.asc), dAng(d.cusps[3], d.ic),
        dAng(d.cusps[6], d.dsc), dAng(d.cusps[9], d.mc),
      );
    }
    check(`${name}: directed cusps 1/4/7/10 are the directed angles`, worstQ < 1e-9,
      `max Δ ${(worstQ * RAD2DEG * 3600).toFixed(3)}″ over ${QUADRANT.length} quadrant systems`);

    // Whole sign is detected by every cusp lying on a sign boundary (WheelSvg's 1e-6
    // rad test). A rigid +arc would walk them off it and silently flip the wheel to
    // quadrant layout mid-overlay, so the cusps have to come from the house engine.
    const bw = relocate(birthJD, CHART.birthplace.lat, CHART.birthplace.lng, 'whole');
    const dw = directedAngles(bw, birthJD, CHART.birthplace.lat, CHART.birthplace.lng, 'whole', layer.angleArc, layer.angleFrame);
    const offBoundary = Math.max(...dw.cusps.map((c) => {
      const m = ((c % (Math.PI / 6)) + Math.PI / 6) % (Math.PI / 6);
      return Math.min(m, Math.PI / 6 - m);
    }));
    check(`${name}: directed whole-sign cusps stay on their sign boundaries`, offBoundary < 1e-6);
    check(`${name}: directed whole-sign wheel anchors on the DIRECTED rising sign`,
      dAng(dw.cusps[0], Math.floor(dw.asc / (Math.PI / 6)) * (Math.PI / 6)) < 1e-9);
  }

  // ── The invariant that would have caught all of this ────────────────────────
  // An Ascendant is ON the horizon; a Midheaven is ON the meridian. Read the directed
  // angles back through the shipped horizontal-coordinate path, in the overlay's OWN
  // map frame. That last part is what gives it teeth: it fails if the angles are wrong
  // (defect 1), if the map frame is wrong (defect 2), or if the two were derived at
  // different meridians — which is exactly how the two defects differed. Before
  // 2026-08-24 this read −16.7° of altitude under sa-long and −17.4° under naibod-long.
  for (const [name, layer] of [['sa-long', saL], ['sa-ra', saRa], ['naibod-ra', naibod]] as const) {
    const dir = directedAngles(
      baseAng, birthJD, CHART.birthplace.lat, CHART.birthplace.lng, 'placidus',
      layer.angleArc, layer.angleFrame,
    );
    const ac = getAngleCoords(dir, layer.gmst, eps, CHART.birthplace.lat, CHART.birthplace.lng);
    const lst = layer.gmst + CHART.birthplace.lng * DEG2RAD;
    check(`${name}: the directed ASC sits on its own horizon`,
      Math.abs(ac.asc.alt) * RAD2DEG < 1e-9, `alt ${(ac.asc.alt * RAD2DEG).toFixed(6)}°`);
    check(`${name}: the directed MC sits on its own meridian`,
      dAng(lst, ac.mc.ra) * RAD2DEG < 1e-9, `hour angle ${(dAng(lst, ac.mc.ra) * RAD2DEG).toFixed(6)}°`);
  }

  // The map frame's anchor, pinned. `-long` must culminate the directed MC at the
  // CHART'S OWN meridian; anchoring at Greenwich (or at the map pin) fails this.
  check(
    'progressed sa-long: the map frame culminates the directed MC at the birth meridian',
    dAng(saL.gmst + CHART.birthplace.lng * DEG2RAD, advRamc) < 1e-12,
  );
  // …and Δλ = 0 must round-trip to the natal frame exactly, through the new local form.
  const saL0 = buildOverlay(CHART, 'progressed', jdToEpochMs(birthJD), null, 'mean', 'sa-long', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  const nai0 = buildOverlay(CHART, 'progressed', jdToEpochMs(birthJD), null, 'mean', 'naibod-long', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  check('longitude methods at age 0: frame is the natal RAMC exactly',
    dAng(saL0.gmst, natalGmst) < 1e-12 && dAng(nai0.gmst, natalGmst) < 1e-12);

  // The `-ra` frame is anchor-INDEPENDENT — the true half of the Greenwich rule. Assert
  // it at meridians the chart has nothing to do with, so a future "tidy-up" that gives
  // the RA methods a birthplace term too gets caught.
  {
    let worstRa = 0;
    for (const [lat, lng] of [[0, 0], [51.5, -0.1], [-33.9, 151.2], [69.6, 18.96]] as const) {
      const b = relocate(birthJD, lat, lng, 'placidus');
      const d = directedAngles(b, birthJD, lat, lng, 'placidus', saRa.angleArc, saRa.angleFrame);
      worstRa = Math.max(worstRa, dAng(eclipticLonOfRA(saRa.gmst + lng * DEG2RAD, eps), d.mc));
    }
    check('sa-ra: the map frame culminates the directed MC at EVERY meridian',
      worstRa * RAD2DEG < 1e-9, `max Δ ${(worstRa * RAD2DEG).toExponential(2)}°`);
  }

  // ── One overlay, one instant (Lina's tertiary ruling, 24 Aug 2026) ──────────
  // The tertiary clock used to reach the BODIES only: the angle arc was measured to
  // the secondary-progressed Sun, so a tertiary chart carried tertiary planets against
  // secondary angles, and its angles were byte-identical to the secondary overlay's at
  // the same date. Solar Fire and Sirius both put them on the tertiary instant.
  const sunLonAt = (jd: number) => {
    const p = getPlanetPositions(jd, 'mean').find((x) => x.name === 'Sun')!;
    return raDecToEclipticLon(p.ra, p.dec, eps);
  };
  const natalSunLon = sunLonAt(birthJD);
  const terOf = (ap: AngleProgression) =>
    buildOverlay(CHART, 'tertiary-progressed', target, null, 'mean', ap, 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  const terSaL = terOf('sa-long');
  check(
    'tertiary sa-long: the angle arc is the Sun\'s travel to the TERTIARY instant',
    dAng(terSaL.angleArc ?? 0, normalizeAngle(sunLonAt(wantTer) - natalSunLon)) < 1e-12,
    `${((terSaL.angleArc ?? 0) * RAD2DEG).toFixed(2)}°`,
  );
  check(
    'tertiary angles are no longer the secondary angles at the same date',
    dAng(terSaL.angleArc ?? 0, saL.angleArc ?? 0) * RAD2DEG > 1,
    `tertiary ${((terSaL.angleArc ?? 0) * RAD2DEG).toFixed(2)}° vs secondary ${((saL.angleArc ?? 0) * RAD2DEG).toFixed(2)}°`,
  );
  // Naibod is a mean RATE, so it follows the same instant: 0.985647° per progressed
  // day. Wrapped, because the tertiary hand passes a full turn of mean solar motion
  // before age 28 and an arc is a rotation — only the residue means anything.
  const terNai = terOf('naibod-ra');
  check(
    'tertiary naibod: the same mean rate over the TERTIARY interval, wrapped',
    dAng(terNai.angleArc ?? 0, normalizeAngle((wantTer - birthJD) * 0.985647 * DEG2RAD)) < 1e-12,
    `${((terNai.angleArc ?? 0) * RAD2DEG).toFixed(2)}° over ${(wantTer - birthJD).toFixed(1)} progressed days`,
  );
  check(
    'secondary naibod is untouched by the tertiary fix',
    dAng(naibod.angleArc ?? 0, 0.985647 * years * DEG2RAD) < 1e-12,
  );
  // The point of the ruling, stated as an invariant: whatever clock an overlay runs,
  // the instant its bodies are read at is the instant its angle arc is measured to.
  for (const [name, layer, progJd] of [
    ['secondary', saL, wantSec], ['tertiary', terSaL, wantTer],
  ] as const) {
    check(`${name}: bodies and angle arc share one instant`,
      Math.abs(layer.jd - progJd) < 1e-9 &&
        dAng(layer.angleArc ?? 0, normalizeAngle(sunLonAt(layer.jd) - natalSunLon)) < 1e-12);
  }
}

// ── 2. Solar arc ──────────────────────────────────────────────────────────────
{
  const sa = buildOverlay(CHART, 'solar-arc', target, null, 'mean', 'sa-long', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  // The arc, re-derived directly from Swiss ecliptic longitudes (one code path
  // fewer than the app's RA/dec→longitude route, and using each instant's own
  // frame) — also quantifies the natal-epsilon simplification.
  const FLAG = node.CalculationFlag.SwissEphemeris | node.CalculationFlag.Speed;
  const progJD = birthJD + years;
  const lonN = node.calculatePosition(birthJD, node.Planet.Sun, FLAG).longitude;
  const lonP = node.calculatePosition(progJD, node.Planet.Sun, FLAG).longitude;
  const arcSwiss = normalizeAngle((lonP - lonN) * DEG2RAD);
  // The applied arc is the layer's angleArc (radians).
  const arcApplied = sa.angleArc!;
  check(
    'solar arc equals the progressed Sun\'s longitude travel',
    dAng(arcApplied, arcSwiss) * RAD2DEG < 0.5 * ARCSEC,
    `Δ ${((dAng(arcApplied, arcSwiss) * RAD2DEG) / ARCSEC).toFixed(3)}″ (natal-ε simplification)`,
  );
  // The Sun's real daily motion spans ~0.953°/day (aphelion, early July — which
  // a June birth's progressed month lands on) to ~1.019°/day (perihelion).
  check('solar arc within the Sun\'s real rate band (0.95–1.03°/yr)', arcApplied * RAD2DEG / years > 0.95 && arcApplied * RAD2DEG / years < 1.03, `${(arcApplied * RAD2DEG / years).toFixed(4)}°/yr`);

  // Directed MC = natal MC + arc (longitude frame), through directedAngles.
  const natalAngles = relocate(birthJD, CHART.birthplace.lat, CHART.birthplace.lng, 'placidus');
  const saDir = directedAngles(natalAngles, birthJD, CHART.birthplace.lat, CHART.birthplace.lng, 'placidus', sa.angleArc, sa.angleFrame);
  check('directed MC = natal MC + arc (sa-long)', dAng(saDir.mc, natalAngles.mc + arcApplied) < 1e-12);
  // Bodies shifted by the same arc in longitude.
  const dSun = dAng(raDecToEclipticLon(sa.positions[0].ra, sa.positions[0].dec, eps), raDecToEclipticLon(natal[0].ra, natal[0].dec, eps) + arcApplied);
  check('directed bodies shifted by the same arc (sa-long)', dSun < 1e-9, `Δ ${dSun.toExponential(2)} rad`);

  // Age 0 → arc 0 (the directed chart IS the natal chart at birth).
  const sa0 = buildOverlay(CHART, 'solar-arc', jdToEpochMs(birthJD), null, 'mean', 'sa-long', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  check('solar arc at age 0 is 0', Math.abs(sa0.angleArc ?? 0) < 1e-9);
}

// ── 3. Primary directions ─────────────────────────────────────────────────────
{
  const pd = buildOverlay(CHART, 'primary-directions', target, null, 'mean', 'mean-quotidian', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  // Ptolemy key: 1°/yr — extract the applied RA arc from the shifted Sun.
  const arc = normalizeAngle(natal[0].ra - pd.positions[0].ra); // bodies move −arc
  check('Ptolemy key: arc = 1°/yr × years', Math.abs(arc * RAD2DEG - years) < 1e-9, `${(arc * RAD2DEG).toFixed(6)}° at ${years.toFixed(4)} yr`);

  // MAP EQUIVALENCE (the design claim in timeline.ts): bodies−arc against the
  // natal RAMC draws the same lines as natal bodies against RAMC+arc.
  const mlA: MeridianLng = (ra) => ((ra - pd.gmst) * 180) / Math.PI;
  const mlB: MeridianLng = (ra) => ((ra - (pd.gmst + arc)) * 180) / Math.PI;
  const linesA = generateLines(pd.positions.slice(0, 3), mlA);
  const linesB = generateLines(natal.slice(0, 3), mlB);
  let worst = 0;
  for (let i = 0; i < linesA.features.length; i++) {
    const ca = linesA.features[i].geometry.coordinates as [number, number][];
    const cb = linesB.features[i].geometry.coordinates as [number, number][];
    if (ca.length !== cb.length) { worst = Infinity; break; }
    for (let k = 0; k < ca.length; k++) {
      // Fold the longitude delta to the true circular distance (a raw %360 of a
      // near-360 seam-wrap delta would read ~360, not ~0).
      const dLng = Math.abs(ca[k][0] - cb[k][0]) % 360;
      worst = Math.max(worst, Math.min(dLng, 360 - dLng), Math.abs(ca[k][1] - cb[k][1]));
    }
  }
  check('primary directions: rigid rotation ≡ advancing the RAMC (map lines)', worst < 1e-9, `max vertex Δ ${worst.toExponential(2)}°`);

  // The bi-wheel's directed angles now use the classical RAMC + arc (Q5/Q6): the directed
  // MC matches the independent closed-form eclipticLonOfRA(RAMC + arc) — a different code
  // path than relocate — and advances FORWARD (~1°/yr), not the old rigid −arc rotation
  // that crept backward through the zodiac.
  const natalAngles = relocate(birthJD, CHART.birthplace.lat, CHART.birthplace.lng, 'placidus');
  const dir = directedAngles(natalAngles, birthJD, CHART.birthplace.lat, CHART.birthplace.lng, 'placidus', pd.angleArc, pd.angleFrame);
  const classicalMc = eclipticLonOfRA(natalGmst + CHART.birthplace.lng * DEG2RAD + arc, eps);
  check('primary: bi-wheel angle frame is forward RAMC + arc', pd.angleFrame === 'ramc' && Math.abs((pd.angleArc ?? 0) - arc) < 1e-12);
  check('primary: directed MC = closed-form RAMC + arc', dAng(dir.mc, classicalMc) < 1e-9, `Δ ${(dAng(dir.mc, classicalMc) * RAD2DEG / ARCSEC).toFixed(3)}″`);
  // Forward through the zodiac (the textbook "MC advances ~1°/yr"), not frozen / backward.
  check('primary: directed MC advances forward of natal', normalizeAngle(dir.mc - natalAngles.mc) > 0);
  const fmtZ = (lon: number) => {
    const d = ((lon * RAD2DEG) % 360 + 360) % 360;
    const SIGNS = ['Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir', 'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis'];
    return `${Math.floor(d % 30)}°${String(Math.floor(((d % 30) % 1) * 60)).padStart(2, '0')}′ ${SIGNS[Math.floor(d / 30)]}`;
  };
  console.log(`  [convention table] age 30, Ptolemy key, ${CHART.name} @ birthplace:`);
  console.log(`    natal MC          ${fmtZ(natalAngles.mc)}`);
  console.log(`    app directed MC   ${fmtZ(dir.mc)}   (RAMC + arc → advances ~1°/yr)`);
  console.log(`    classical dir. MC ${fmtZ(classicalMc)}   (independent closed form)`);

  // Rate keys scale the arc as documented.
  const naibod = buildOverlay(CHART, 'primary-directions', target, null, 'mean', 'mean-quotidian', 'naibod', 1, 'relative-to-natal', 'secondary', t)!;
  const arcN = normalizeAngle(natal[0].ra - naibod.positions[0].ra);
  check('Naibod key: 0.985647°/yr', Math.abs(arcN * RAD2DEG - 0.985647 * years) < 1e-9);
  const user2 = buildOverlay(CHART, 'primary-directions', target, null, 'mean', 'mean-quotidian', 'user', 2, 'relative-to-natal', 'secondary', t)!;
  const arcU = normalizeAngle(natal[0].ra - user2.positions[0].ra);
  check('user key 2°/yr honored', Math.abs(arcU * RAD2DEG - 2 * years) < 1e-9);
}

// ── 4. Transit frames ─────────────────────────────────────────────────────────
{
  const rel = buildOverlay(CHART, 'transits', target, null, 'mean', 'mean-quotidian', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  check('transits relative-to-natal: natal RAMC', dAng(rel.gmst, natalGmst) < 1e-12);
  const mom = buildOverlay(CHART, 'transits', target, null, 'mean', 'mean-quotidian', 'ptolemy', 1, 'transit-moment', 'secondary', t)!;
  check('transits transit-moment: the instant\'s RAMC', dAng(mom.gmst, gmstRadians(targetJD)) < 1e-12);
  const sunNow = getPlanetPositions(targetJD, 'mean')[0];
  check('transit positions are the real sky either way', dAng(rel.positions[0].ra, sunNow.ra) < 1e-12 && dAng(mom.positions[0].ra, sunNow.ra) < 1e-12);
}

// ── 5. Cyclocartography body split ────────────────────────────────────────────
{
  const cy = buildOverlay(CHART, 'cyclo', target, null, 'mean', 'mean-quotidian', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  const progJD = birthJD + years;
  const sunProg = getPlanetPositions(progJD, 'mean').find((p) => p.name === 'Sun')!;
  const jupNow = getPlanetPositions(targetJD, 'mean').find((p) => p.name === 'Jupiter')!;
  const cySun = cy.positions.find((p) => p.name === 'Sun')!;
  const cyJup = cy.positions.find((p) => p.name === 'Jupiter')!;
  check('cyclo: Sun progressed / Jupiter transiting', dAng(cySun.ra, sunProg.ra) < 1e-12 && dAng(cyJup.ra, jupNow.ra) < 1e-12);
  // bodyJd lists ONLY the progressed inners; the transiting outers inherit the
  // layer's jd (the transit instant) by design.
  check(
    'cyclo: per-body epochs — inners progressed, outers on layer jd',
    Math.abs((cy.bodyJd?.Sun ?? 0) - progJD) < 1e-9 && cy.bodyJd?.Jupiter === undefined && Math.abs(cy.jd - targetJD) < 1e-9,
  );
  check('cyclo: natal frame', dAng(cy.gmst, natalGmst) < 1e-12);
}

// ── 6. Synastry framing ───────────────────────────────────────────────────────
{
  const sy = buildOverlay(CHART, 'synastry', target, PARTNER, 'mean', 'mean-quotidian', 'ptolemy', 1, 'relative-to-natal', 'secondary', t)!;
  const pjd = birthDataToJD(PARTNER);
  const pSun = getPlanetPositions(pjd, 'mean')[0];
  check('synastry: partner positions at partner instant', Math.abs(sy.jd - pjd) < 1e-9 && dAng(sy.positions[0].ra, pSun.ra) < 1e-12);
  check('synastry: partner\'s own RAMC (their ACG overlaid)', dAng(sy.gmst, gmstRadians(pjd)) < 1e-12);
}

// ── 7. Davison midpoints ──────────────────────────────────────────────────────
{
  const dav = buildDavison(CHART, PARTNER);
  const jdMid = (birthDataToJD(CHART) + birthDataToJD(PARTNER)) / 2;
  check('Davison: time midpoint (minute-snapped)', Math.abs(birthDataToJD(dav) - jdMid) * 86400 <= 30.5, `Δ ${(Math.abs(birthDataToJD(dav) - jdMid) * 86400).toFixed(1)}s`);
  check('Davison: tz stored as UT', dav.tzOffset === 0);
  check('Davison: latitude arithmetic mean', Math.abs(dav.birthplace.lat - (CHART.birthplace.lat + PARTNER.birthplace.lat) / 2) < 1e-9);

  // Longitude midpoint goldens, incl. the antimeridian pair.
  const at = (lngA: number, lngB: number) =>
    buildDavison(
      { ...CHART, birthplace: { ...CHART.birthplace, lng: lngA } },
      { ...PARTNER, birthplace: { ...PARTNER.birthplace, lng: lngB } },
    ).birthplace.lng;
  check('Davison lng: (+170, −170) → ±180 (shorter arc, not 0)', Math.abs(Math.abs(at(170, -170)) - 180) < 1e-9, `got ${at(170, -170)}`);
  check('Davison lng: (10, 30) → 20', Math.abs(at(10, 30) - 20) < 1e-9, `got ${at(10, 30)}`);
  check('Davison lng: (−10, 30) → 10', Math.abs(at(-10, 30) - 10) < 1e-9, `got ${at(-10, 30)}`);
}

console.log(failures === 0 ? '\nverify-directions: ALL PASS' : `\nverify-directions: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
