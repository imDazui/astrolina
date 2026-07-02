// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the REAL aspect/midpoint line generators (src/lib/astro/
// angleAspects.ts, run via the harness: `npm run verify:aspect-lines`) on the
// positions the app actually feeds them — most pointedly a MIDPOINT chart,
// whose equatorial positions are per-coordinate means carrying their ecliptic
// longitude of record (see composite.ts). What must hold, per measuring frame:
//
//  - zodiaco: the virtual point of every aspect/midpoint derives from the
//    body's zodiacal longitude OF RECORD (the flatten honors the carried
//    longitude) — NEVER from a geometric inversion of the mean ra/dec, which
//    for wide pairs lands whole degrees away (the sentinel below shows the
//    gap it would introduce).
//  - mundo: aspect offsets are measured in RIGHT ASCENSION from the same mean
//    RA that draws the body's own angle lines, and pair midpoints are the
//    bodily mean-RA/mean-declination points (the module's documented
//    convention, which the composite bodies themselves now share).
//  - natal charts: positions carry nothing, so both frames reproduce the
//    long-standing geometric round-trip exactly (verify-angle-aspects.mjs
//    holds the external goldens for that path).
import {
  eclipticToRaDec,
  getPlanetPositions,
  initEphemeris,
  obliquity,
  projectOntoEcliptic,
  raDecToEclipticLon,
  type PlanetName,
  type PlanetPosition,
} from '../src/lib/ephemeris';
import {
  generateAspectLines,
  generateMidpointLines,
  type AngleOverlayLineProps,
} from '../src/lib/astro/angleAspects';
import {
  compositeEquatorial,
  solveCompositeFrameJd,
  shortArcMidLon,
} from '../src/lib/astro/composite';
import type { CompositeParents } from '../src/lib/chartLibrary';
import type { Feature, LineString } from 'geojson';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const wrap2pi = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
// Angular difference in degrees, mod 360, mapped to [0, 180].
const angErr = (a: number, b: number) =>
  Math.abs((((a - b + 180) % 360) + 360) % 360 - 180);

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

await initEphemeris();

// The composite benchmark pair from verify-composite.mjs (bare de-identified
// moments; positions are geocentric so the place labels are arbitrary).
const parents: CompositeParents = {
  a: {
    name: 'A',
    year: 1959, month: 9, day: 8, hour: 0, minute: 32,
    tzOffset: 0,
    birthplace: { label: '', lat: 0, lng: 0 },
  },
  b: {
    name: 'B',
    year: 1963, month: 9, day: 23, hour: 3, minute: 12,
    tzOffset: 0,
    birthplace: { label: '', lat: 0, lng: 0 },
  },
};

const jdFrame = solveCompositeFrameJd(parents);
const eps = obliquity(jdFrame);
// Celestial meridian mapping with GMST = 0: lng ≡ RA in degrees, so a feature's
// targetLng recovers its virtual point's RA directly (targetLat its dec).
const mer = (ra: number) => ra * RAD2DEG;

const mundo = compositeEquatorial(parents, 'mean');
const flat = projectOntoEcliptic(mundo, jdFrame);
const byName = (ps: PlanetPosition[], n: PlanetName) =>
  ps.find((p) => p.name === n)!;

type AspectFeature = Feature<LineString, AngleOverlayLineProps>;
// The MC-branch feature of a given planet+aspect — its targetLng/targetLat ARE
// the virtual point's sub-point (RA, dec in degrees) under `mer`.
const mcBranch = (fs: AspectFeature[], planet: PlanetName, aspect: string) =>
  fs.find(
    (f) =>
      f.properties.planet === planet &&
      f.properties.kind === 'aspect' &&
      f.properties.branch === 'MC' &&
      f.properties.aspect === aspect,
  )!;

// (1) ZODIACO aspect lines on the midpoint chart: every virtual point must sit
// at (longitude of record + aspect) ON THE ECLIPTIC — the same longitudes the
// wheel shows — not at an inversion of the mean ra/dec.
{
  const fs = generateAspectLines(flat, mer, 'zodiaco', eps).features;
  for (const name of ['Moon', 'Jupiter', 'Saturn', 'Neptune'] as PlanetName[]) {
    const lonMid = byName(mundo, name).lon!; // longitude of record (radians)
    const want = eclipticToRaDec(wrap2pi(lonMid + 90 * DEG2RAD), 0, eps);
    const got = mcBranch(fs, name, 'square');
    check(
      `zodiaco: ${name} square virtual point anchors at lonMid + 90°`,
      angErr(got.properties.targetLng, want.ra * RAD2DEG) < 1e-6 &&
        Math.abs(got.properties.targetLat - want.dec * RAD2DEG) < 1e-6,
      `ΔRA ${angErr(got.properties.targetLng, want.ra * RAD2DEG).toExponential(1)}°`,
    );
  }
  // Sentinel: had the flatten inverted the mean ra/dec instead of honoring the
  // longitude of record, whole aspect-line families would anchor visibly off
  // their wheel longitudes (tens of arcminutes for this pair; grows with the
  // parents' separation) — the failure mode this suite exists to catch. The
  // floor is far above float noise while safely below any real pair's gap.
  const gapDeg = Math.max(
    ...mundo.map((p) => angErr(raDecToEclipticLon(p.ra, p.dec, eps) * RAD2DEG, p.lon! * RAD2DEG)),
  );
  check(
    'sentinel: mean-ra/dec inversion would misplace the aspect lines',
    gapDeg > 0.25,
    `worst body would be off by ${gapDeg.toFixed(2)}°`,
  );
}

// (2) MUNDO aspect lines on the midpoint chart: offsets measured in RA from
// the body's own mean RA (the exact RA that anchors its base MC/IC lines), the
// virtual point being the ecliptic degree holding that RA.
{
  const fs = generateAspectLines(mundo, mer, 'mundo', eps).features;
  for (const name of ['Moon', 'Jupiter', 'Saturn', 'Neptune'] as PlanetName[]) {
    const p = byName(mundo, name);
    const got = mcBranch(fs, name, 'square');
    check(
      `mundo: ${name} square virtual point sits at mean RA + 90°`,
      angErr(got.properties.targetLng, (p.ra + 90 * DEG2RAD) * RAD2DEG) < 1e-6,
    );
  }
}

// (3) MUNDO midpoint lines on the midpoint chart: the pair's virtual point is
// the bodily midpoint — shorter-arc mean RA, plain mean declination — of the
// two composite bodies.
{
  const fs = generateMidpointLines(mundo, mer, 'mundo', eps).features;
  const sun = byName(mundo, 'Sun');
  const moon = byName(mundo, 'Moon');
  const got = fs.find(
    (f) =>
      f.properties.kind === 'midpoint' &&
      f.properties.planet === 'Sun' &&
      f.properties.planetB === 'Moon' &&
      f.properties.lineType === 'MC',
  )!;
  const wantRa = shortArcMidLon(sun.ra, moon.ra) * RAD2DEG;
  const wantDec = ((sun.dec + moon.dec) / 2) * RAD2DEG;
  check(
    'mundo: Su/Mo midpoint line = bodily mean RA + mean declination',
    angErr(got.properties.targetLng, wantRa) < 1e-6 &&
      Math.abs(got.properties.targetLat - wantDec) < 1e-6,
  );
}

// (4) ZODIACO midpoint lines on the midpoint chart: the classic λ-average of
// the two longitudes of record, on the ecliptic.
{
  const fs = generateMidpointLines(flat, mer, 'zodiaco', eps).features;
  const wantLon = shortArcMidLon(
    byName(mundo, 'Sun').lon!,
    byName(mundo, 'Moon').lon!,
  );
  const want = eclipticToRaDec(wantLon, 0, eps);
  const got = fs.find(
    (f) =>
      f.properties.kind === 'midpoint' &&
      f.properties.planet === 'Sun' &&
      f.properties.planetB === 'Moon' &&
      f.properties.lineType === 'MC',
  )!;
  check(
    'zodiaco: Su/Mo midpoint line anchors at the λ-average of record',
    angErr(got.properties.targetLng, want.ra * RAD2DEG) < 1e-6 &&
      Math.abs(got.properties.targetLat - want.dec * RAD2DEG) < 1e-6,
  );
}

// (5) Natal charts are untouched: bare samples carry no longitude of record,
// so the zodiaco flatten reproduces the geometric round-trip of the true
// ra/dec exactly, and the mundo generator reads the same native RA as ever.
{
  const jd = 2447892.5; // 1990-01-01 00:00 UT — arbitrary natal moment
  const natal = getPlanetPositions(jd, 'mean');
  const epsN = obliquity(jd);
  check(
    'natal: samples carry no coordinates of record',
    natal.every((p) => p.lon === undefined && p.lat === undefined),
  );
  const flatN = projectOntoEcliptic(natal, jd);
  const sun = byName(natal, 'Sun');
  const fs = generateAspectLines(flatN, mer, 'zodiaco', epsN).features;
  const got = mcBranch(fs, 'Sun', 'square');
  const want = eclipticToRaDec(
    wrap2pi(raDecToEclipticLon(sun.ra, sun.dec, epsN) + 90 * DEG2RAD),
    0,
    epsN,
  );
  check(
    'natal: zodiacal Sun square anchors at the geometric round-trip + 90°',
    angErr(got.properties.targetLng, want.ra * RAD2DEG) < 1e-6,
  );
}

// (6) The base lines and the aspect lines agree on the composite frame: the
// virtual point of a mundo aspect and the body's own line family are anchored
// by RAs exactly one aspect apart, so their meridians are parallel offsets.
{
  const fs = generateAspectLines(mundo, mer, 'mundo', eps).features;
  const sun = byName(mundo, 'Sun');
  const trine = mcBranch(fs, 'Sun', 'trine');
  check(
    'mundo: aspect meridian offset equals the aspect angle (Sun trine)',
    angErr(trine.properties.targetLng, (sun.ra + 120 * DEG2RAD) * RAD2DEG) < 1e-6,
  );
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
