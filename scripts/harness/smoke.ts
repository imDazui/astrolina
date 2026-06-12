// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Harness acceptance gate (`npm run verify:harness`). Proves two things at once:
//   1. The harness works: the REAL src/lib/ephemeris.ts runs under Node with
//      the @swisseph/node shim and the on-disk .se1 files, end to end.
//   2. The real code agrees bit-for-bit with direct @swisseph/node calls on the
//      same golden inputs used by scripts/verify-ephemeris.mjs — retroactively
//      confirming that the older mirror-style script matches the shipped code.
// It also asserts enum-value parity between @swisseph/browser and
// @swisseph/node, which the shim's delegation silently depends on.
import { createRequire } from 'node:module';
import {
  birthDataToJD,
  getPlanetPositions,
  gmstRadians,
  initEphemeris,
  isEphemerisDataVerified,
  relocate,
  type PlanetName,
} from '../../src/lib/ephemeris';
import type { BirthData } from '../../src/lib/birthData';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const node: any = createRequire(import.meta.url)('@swisseph/node');

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
}

// ── 1. Enum parity between the two Swiss wrappers ────────────────────────────
// The specifier is computed so esbuild's alias plugin doesn't rewrite it: this
// import must load the REAL browser package (its enums evaluate fine in Node;
// only init() needs a browser).
const browser = await import('@swisseph/' + 'browser');

const ENUM_GROUPS: Array<[string, string[]]> = [
  ['Planet', ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'EclipticNutation']],
  ['LunarPoint', ['MeanNode', 'TrueNode', 'MeanApogee']],
  ['Asteroid', ['Chiron', 'Ceres', 'Pallas', 'Juno', 'Vesta']],
  ['HouseSystem', ['Placidus', 'WholeSign', 'Equal', 'Koch', 'Regiomontanus', 'Campanus', 'Porphyrius', 'Alcabitus']],
  ['CalculationFlag', ['SwissEphemeris', 'MoshierEphemeris', 'Speed', 'Equatorial']],
  ['CalendarType', ['Gregorian', 'Julian']],
];
for (const [group, keys] of ENUM_GROUPS) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = (browser as any)[group];
  const n = node[group];
  const bad = keys.filter((k) => b?.[k] === undefined || b[k] !== n?.[k]);
  check(
    `enum parity: ${group}`,
    bad.length === 0,
    bad.map((k) => `${k}: browser=${b?.[k]} node=${n?.[k]}`).join(', '),
  );
}

// ── 2. Real chain vs direct node calls on the verify-ephemeris goldens ───────
await initEphemeris();
check('Swiss .se1 data verified (not Moshier fallback)', isEphemerisDataVerified());

const FLAG_EQ =
  node.CalculationFlag.SwissEphemeris | node.CalculationFlag.Speed | node.CalculationFlag.Equatorial;
const DEG2RAD = Math.PI / 180;
const norm2pi = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

const birth = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tzOffset: number,
): BirthData => ({
  name: 'smoke',
  year,
  month,
  day,
  hour,
  minute,
  tzOffset,
  birthplace: { label: 'smoke', lat: 0, lng: 0 },
});

// Same four cases as scripts/verify-ephemeris.mjs.
const CASES: Array<[string, BirthData]> = [
  ['Einstein 1879-03-14 11:30 LMT Ulm', birth(1879, 3, 14, 11, 30, 9.9876 / 15)],
  ['J2000.0 (2000-01-01 12:00 UTC)', birth(2000, 1, 1, 12, 0, 0)],
  ['Summer solstice (2024-06-21 12:00 UTC)', birth(2024, 6, 21, 12, 0, 0)],
  ['Tokyo 1990-05-15 06:00 JST (+9)', birth(1990, 5, 15, 6, 0, 9)],
];

const BODY_ID: Partial<Record<PlanetName, number>> = {
  Sun: node.Planet.Sun,
  Moon: node.Planet.Moon,
  Mercury: node.Planet.Mercury,
  Venus: node.Planet.Venus,
  Mars: node.Planet.Mars,
  Jupiter: node.Planet.Jupiter,
  Saturn: node.Planet.Saturn,
  Uranus: node.Planet.Uranus,
  Neptune: node.Planet.Neptune,
  Pluto: node.Planet.Pluto,
  NorthNode: node.LunarPoint.MeanNode,
};

for (const [label, b] of CASES) {
  // Julian Day: real birthDataToJD vs direct node computation of the same recipe.
  const jd = birthDataToJD(b);
  const reformed =
    b.year > 1582 || (b.year === 1582 && (b.month > 10 || (b.month === 10 && b.day >= 15)));
  const jdDirect =
    node.julianDay(
      b.year,
      b.month,
      b.day,
      0,
      reformed ? node.CalendarType.Gregorian : node.CalendarType.Julian,
    ) +
    (b.hour + b.minute / 60 - b.tzOffset) / 24;
  check(`${label}: birthDataToJD`, Math.abs(jd - jdDirect) < 1e-9, `Δ=${jd - jdDirect}`);

  // GMST: real gmstRadians vs direct armc-at-Greenwich.
  const gmst = gmstRadians(jd);
  const armc = node.calculateHouses(jd, 0, 0, node.HouseSystem.WholeSign).armc;
  const gmstDirect = norm2pi(armc * DEG2RAD);
  check(`${label}: gmstRadians`, Math.abs(gmst - gmstDirect) < 1e-12, `Δ=${gmst - gmstDirect}`);

  // Body RA/dec: the real sampling layer vs direct equatorial calls.
  const positions = getPlanetPositions(jd, 'mean');
  let worst = 0;
  let worstBody = '';
  for (const p of positions) {
    const id = BODY_ID[p.name];
    if (id === undefined) continue; // SouthNode/Lilith/asteroids: derived or seas-gated
    const eq = node.calculatePosition(jd, id, FLAG_EQ);
    const dRa = Math.abs(norm2pi(p.ra) - norm2pi(eq.longitude * DEG2RAD));
    const dDec = Math.abs(p.dec - eq.latitude * DEG2RAD);
    const d = Math.max(Math.min(dRa, 2 * Math.PI - dRa), dDec);
    if (d > worst) {
      worst = d;
      worstBody = p.name;
    }
  }
  check(`${label}: body RA/dec (11 bodies)`, worst < 1e-12, `worst ${worstBody} Δ=${worst} rad`);

  // Relocated angles: the real relocate() vs direct houses at Einstein's Ulm.
  const h = relocate(jd, 48.4011, 9.9876, 'placidus');
  const direct = node.calculateHouses(jd, 48.4011, 9.9876, node.HouseSystem.Placidus);
  check(
    `${label}: relocate asc/mc`,
    Math.abs(h.asc - norm2pi(direct.ascendant * DEG2RAD)) < 1e-12 &&
      Math.abs(h.mc - norm2pi(direct.mc * DEG2RAD)) < 1e-12,
    `asc Δ=${h.asc - norm2pi(direct.ascendant * DEG2RAD)}`,
  );
}

console.log(failures === 0 ? '\nHarness smoke: ALL PASS' : `\nHarness smoke: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
