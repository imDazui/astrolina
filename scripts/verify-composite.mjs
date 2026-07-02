// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the composite-midpoints math in src/lib/astro/composite.ts
// (replicated here — the app module imports the browser ephemeris, which
// doesn't load under Node): shorter-arc midpoints incl. the 0°-Aries wrap and
// the exactly-opposed tie-break, node antipodality, the MC-midpoint MAP frame
// solver (composite MC = shorter-arc midpoint of the two natal MCs, latitude-free,
// solved jd within a half sidereal day of the Davison midpoint), the à-la-Hand
// WHEEL angles (composite ASC and MC are each the exact midpoint of the two natal
// ones), the wheel↔map MC agreement, the documented map-ASC-vs-wheel-ASC gap,
// a/b symmetry — and the COORDINATE-WISE body midpoints (lat = plain mean,
// dec = plain mean of native declinations, RA = shorter-arc midpoint of native
// RAs) against published Solar Fire / Matrix Horizons composite values for a
// benchmark couple (second jd pair below), including the sentinel that the
// mean declination departs the old flatten-to-ecliptic value.
//
// Run: npm run verify:composite
import swe from '@swisseph/node';
const { setEphemerisPath, julianDay, calculatePosition, calculateHouses, CalculationFlag, Planet, LunarPoint, HouseSystem } = swe;
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

setEphemerisPath(join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'ephe'));

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const TWO_PI = 2 * Math.PI;
const FLAG = CalculationFlag.SwissEphemeris | CalculationFlag.Speed;

const wrap2pi = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
const wrapPi = (a) => {
  let x = a % TWO_PI;
  if (x > Math.PI) x -= TWO_PI;
  if (x <= -Math.PI) x += TWO_PI;
  return x;
};

// Mirrors composite.ts shortArcMidLon.
function shortArcMidLon(a, b, tieRef) {
  let d = wrap2pi(b - a);
  if (d > Math.PI) d -= TWO_PI;
  const mid = wrap2pi(a + d / 2);
  if (Math.abs(Math.abs(d) - Math.PI) > 1e-9) return mid;
  const other = wrap2pi(mid + Math.PI);
  if (tieRef === undefined) return mid < Math.PI ? mid : other;
  return Math.abs(wrapPi(mid - tieRef)) <= Math.abs(wrapPi(other - tieRef)) ? mid : other;
}

const lonOf = (jd, planet) =>
  wrap2pi(calculatePosition(jd, planet, FLAG).longitude * D2R);
// One chart's Ascendant (radians), the same way ephemeris.ts's relocate reads
// it (Swiss calculateHouses; the Ascendant is house-system-independent).
const ascendant = (jd, lat, lng) =>
  wrap2pi(calculateHouses(jd, lat, lng, HouseSystem.Placidus).ascendant * D2R);
// MC (radians) and GMST/ARMC (radians), the same way ephemeris.ts reads them
// (both house-system-independent). eclEps = true obliquity of date; raOfEclLon
// maps an ecliptic longitude (lat 0) to its right ascension — the MC↔RAMC step.
const mcLon = (jd, lat, lng) =>
  wrap2pi(calculateHouses(jd, lat, lng, HouseSystem.Placidus).mc * D2R);
const gmst = (jd) =>
  wrap2pi(calculateHouses(jd, 0, 0, HouseSystem.Placidus).armc * D2R);
const eclEps = (jd) =>
  calculatePosition(jd, Planet.EclipticNutation, CalculationFlag.SwissEphemeris).longitude * D2R;
const raOfEclLon = (lon, eps) =>
  wrap2pi(Math.atan2(Math.sin(lon) * Math.cos(eps), Math.cos(lon)));

// Mirrors relationship.ts midpointLng (the stored composite place's longitude).
const midLngDeg = (a, b) => {
  const diff = ((b - a + 540) % 360) - 180;
  const mid = a + diff / 2;
  return (((mid % 360) + 540) % 360) - 180;
};

const SIDEREAL_DAY = 0.9972695663;

// Mirrors composite.ts solveCompositeFrameJd: the MAP frame jd whose Midheaven at
// the midpoint meridian equals the shorter-arc midpoint of the two natal MCs.
// Latitude-free (MC↔RAMC has no latitude term); GMST inversion by bisection over
// one sidereal day (GMST sweeps a full, near-linear turn there).
function solveCompositeFrameJd(jdA, latA, lngA, jdB, latB, lngB) {
  const midLng = midLngDeg(lngA, lngB);
  const davMid = (jdA + jdB) / 2;
  let lo = davMid - SIDEREAL_DAY / 2;
  let hi = davMid + SIDEREAL_DAY / 2;
  const targetMC = shortArcMidLon(mcLon(jdA, latA, lngA), mcLon(jdB, latB, lngB));
  const targetRamc = raOfEclLon(targetMC, eclEps(davMid));
  const targetGmst = wrap2pi(targetRamc - midLng * D2R);
  const g0 = gmst(lo);
  const rel = wrap2pi(targetGmst - g0);
  for (let i = 0; i < 40 && hi - lo > 1e-7; i++) {
    const mid = (lo + hi) / 2;
    if (wrap2pi(gmst(mid) - g0) < rel) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Mirrors composite.ts compositeAngles (the WHEEL angles): the composite ASC and
// MC are the shorter-arc midpoints of the two parents' OWN ASC / MC (à la Hand).
function compositeWheelAngles(jdA, latA, lngA, jdB, latB, lngB) {
  return {
    asc: shortArcMidLon(ascendant(jdA, latA, lngA), ascendant(jdB, latB, lngB)),
    mc: shortArcMidLon(mcLon(jdA, latA, lngA), mcLon(jdB, latB, lngB)),
  };
}

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

// Parents: Jim Lewis (the seed chart) and a 1948 London birth.
const jdA = julianDay(1941, 6, 5, 13.5); // 09:30 EDT = 13:30 UT
const latA = 40.71, lngA = -74.01; // parent A's birthplace
const jdB = julianDay(1948, 3, 12, 8.25);
const latB = 51.51, lngB = -0.13; // parent B's birthplace (London)

// (1) Composite Sun is the shorter-arc midpoint of the parents' Suns.
const sunA = lonOf(jdA, Planet.Sun);
const sunB = lonOf(jdB, Planet.Sun);
const sunMid = shortArcMidLon(sunA, sunB);
const dA = Math.abs(wrapPi(sunMid - sunA));
const dB = Math.abs(wrapPi(sunMid - sunB));
check(
  'composite Sun equidistant on the shorter arc',
  Math.abs(dA - dB) < 1e-12 && dA <= Math.PI / 2 + 1e-12,
  `each side ${(dA * R2D).toFixed(4)}°`,
);

// (2) 0°-Aries wrap: 350° and 10° must midpoint at 0°, not 180°.
check(
  'wrap midpoint (350°,10°) → 0°',
  Math.abs(wrapPi(shortArcMidLon(350 * D2R, 10 * D2R))) < 1e-12,
);

// (3) Exactly-opposed tie-break lands on the side nearer the reference.
const tied = shortArcMidLon(0, Math.PI, 100 * D2R);
check(
  'opposed pair takes the near-Sun side',
  Math.abs(wrapPi(tied - 90 * D2R)) < 1e-9,
  `chose ${(wrap2pi(tied) * R2D).toFixed(1)}°`,
);

// (4) Node antipodality: SN midpoint is exactly NN midpoint + 180°.
const nnMid = shortArcMidLon(lonOf(jdA, LunarPoint.MeanNode), lonOf(jdB, LunarPoint.MeanNode), sunMid);
const snMid = shortArcMidLon(
  wrap2pi(lonOf(jdA, LunarPoint.MeanNode) + Math.PI),
  wrap2pi(lonOf(jdB, LunarPoint.MeanNode) + Math.PI),
  sunMid,
);
check(
  'south-node midpoint antipodal to north-node midpoint',
  Math.abs(wrapPi(snMid - nnMid - Math.PI)) < 1e-9,
);

// (5) MAP frame (MC-midpoint): the frame's Midheaven at the midpoint meridian
// equals the shorter-arc midpoint of the two natal MCs (latitude-free, so it holds
// at ANY latitude), and the solved jd stays inside the half-sidereal-day window.
const midLng = midLngDeg(lngA, lngB);
const midLat = (latA + latB) / 2;
const wheel = compositeWheelAngles(jdA, latA, lngA, jdB, latB, lngB);
const jdStar = solveCompositeFrameJd(jdA, latA, lngA, jdB, latB, lngB);
const frameMC = mcLon(jdStar, 0, midLng);
const mcResidual = Math.abs(wrapPi(frameMC - wheel.mc));
check(
  'MAP frame: composite Midheaven = shorter-arc midpoint of the natal Midheavens',
  mcResidual < 1e-6,
  `residual ${(mcResidual * R2D * 3600).toFixed(2)}″`,
);
check(
  'MAP frame: solved jd stays within ½ sidereal day of the Davison midpoint',
  Math.abs(jdStar - (jdA + jdB) / 2) <= SIDEREAL_DAY / 2 + 1e-9,
  `${((jdStar - (jdA + jdB) / 2) * 24).toFixed(2)} h offset`,
);
// (5-wheel) WHEEL angles (à la Hand): the composite Ascendant and Midheaven are
// each the exact shorter-arc midpoint of the two natal ones, and the wheel MC
// agrees with the map frame's MC (the meridian axis is consistent wheel↔map).
const ascMid = shortArcMidLon(ascendant(jdA, latA, lngA), ascendant(jdB, latB, lngB));
check(
  'WHEEL: composite Ascendant = shorter-arc midpoint of the natal Ascendants',
  Math.abs(wrapPi(wheel.asc - ascMid)) < 1e-9,
);
check(
  'WHEEL Midheaven agrees with the MAP-frame Midheaven (meridian axis consistent)',
  Math.abs(wrapPi(wheel.mc - frameMC)) < 1e-6,
);
// (5b) The MC frame is latitude-free: it solves cleanly at a high-latitude midpoint
// and stays in-window (no sub-polar ASC-rate concern, since the MC has no latitude term).
const polarStar = solveCompositeFrameJd(jdA, 64.1, -21.9, jdB, 59.9, 10.7);
const polarMidLng = midLngDeg(-21.9, 10.7);
const polarTargetMc = shortArcMidLon(mcLon(jdA, 64.1, -21.9), mcLon(jdB, 59.9, 10.7));
const polarMcResid = Math.abs(wrapPi(mcLon(polarStar, 0, polarMidLng) - polarTargetMc));
check(
  'MAP frame is latitude-free (clean at a high-latitude midpoint ~62°N)',
  polarMcResid < 1e-6 && Math.abs(polarStar - (jdA + jdB) / 2) <= SIDEREAL_DAY / 2 + 1e-9,
  `MC residual ${(polarMcResid * R2D * 3600).toFixed(2)}″`,
);
// (5c) The documented limitation — one RAMC can't realize BOTH midpoints, so the
// MAP frame's Ascendant (its ASC/DSC lines) departs the WHEEL Ascendant. Always
// passes; PRINTS the gap so the trade-off is visible.
const frameAsc = ascendant(jdStar, midLat, midLng);
const ascGap = Math.abs(wrapPi(frameAsc - wheel.asc));
check(
  'map ASC/DSC lines depart the wheel Ascendant (expected; reported)',
  Number.isFinite(ascGap) && ascGap <= Math.PI,
  `wheel ASC − map-frame ASC = ${(ascGap * R2D).toFixed(3)}°`,
);

// (6) Symmetry: swapping the parents changes nothing — including at the
// exactly-opposed tie, where the no-tieRef rule fixes the [0, π) candidate.
check(
  'a/b symmetry (Sun midpoint)',
  Math.abs(wrapPi(shortArcMidLon(sunB, sunA) - sunMid)) < 1e-12,
);
check(
  'a/b symmetry (MAP frame solver)',
  Math.abs(solveCompositeFrameJd(jdB, latB, lngB, jdA, latA, lngA) - jdStar) < 1e-6,
);
check(
  'a/b symmetry at the exact tie (no tieRef)',
  shortArcMidLon(0, Math.PI) === shortArcMidLon(Math.PI, 0),
  `both ${(shortArcMidLon(0, Math.PI) * R2D).toFixed(1)}°`,
);

// (7) Node antipodality survives the exactly-opposed tie: composite.ts now
// DERIVES the South Node as NN-midpoint + 180° instead of midpointing the
// antipodes independently (which the shared near-Sun rule would collapse).
const tiedNN = shortArcMidLon(0.7, 0.7 + Math.PI, 100 * D2R);
const derivedSN = wrap2pi(tiedNN + Math.PI);
check(
  'derived south node antipodal even at the tie',
  Math.abs(wrapPi(derivedSN - tiedNN - Math.PI)) < 1e-12,
);

// ── Coordinate-wise body midpoints (lat / dec / RA) ──────────────────────────
// Mirrors composite.ts compositeSamples: per body, lon = shorter-arc midpoint
// (near-Sun tie), lat = plain mean, dec = plain mean of NATIVE declinations,
// ra = shorter-arc midpoint of native RAs (Sun-RA tie). Benchmarks: the Solar
// Fire (SF) / Matrix Horizons composite tables for this exact couple. SF prints
// D°MM′, so benchmark tolerances allow display rounding (the programs' own
// natal inputs already differ by ≤1′ from ours).
const EQ_FLAG = FLAG | CalculationFlag.Equatorial;
const eclOf = (jd, body) => {
  const r = calculatePosition(jd, body, FLAG);
  return { lon: wrap2pi(r.longitude * D2R), lat: r.latitude * D2R };
};
const eqOf = (jd, body) => {
  // With the Equatorial flag, Swiss returns RA in .longitude, dec in .latitude.
  const r = calculatePosition(jd, body, EQ_FLAG);
  return { ra: wrap2pi(r.longitude * D2R), dec: r.latitude * D2R };
};
const sampleOf = (jd, body) => ({ ...eclOf(jd, body), ...eqOf(jd, body) });
// Declination of an ecliptic (lon, lat) point — the OLD flattened pipeline used
// this with lat 0; the sentinel below proves the mean dec departs it.
const decOfEcl = (lon, lat, eps) =>
  Math.asin(Math.sin(lat) * Math.cos(eps) + Math.cos(lat) * Math.sin(eps) * Math.sin(lon));
const arcmin = (rad) => rad * R2D * 60; // signed arcminutes
const fmtDM = (rad) => {
  const neg = rad < 0;
  let m = Math.round(Math.abs(rad) * R2D * 60);
  const d = Math.floor(m / 60);
  m -= d * 60;
  return `${neg ? '-' : '+'}${d}°${String(m).padStart(2, '0')}′`;
};
const SIGNS = ['ARI', 'TAU', 'GEM', 'CAN', 'LEO', 'VIR', 'LIB', 'SCO', 'SAG', 'CAP', 'AQU', 'PIS'];
const fmtZodiac = (rad) => {
  let m = Math.round(wrap2pi(rad) * R2D * 60);
  let d = Math.floor(m / 60);
  m -= d * 60;
  if (d >= 360) d -= 360;
  return `${String(d % 30).padStart(2, '0')} ${SIGNS[Math.floor(d / 30)]} ${String(m).padStart(2, '0')}`;
};

// The BENCHMARK pair: the couple behind the audit's published Solar Fire /
// Matrix Horizons composite tables. Recovered numerically from those tables
// (natal latitudes + composite longitudes over-determine the two moments; the
// solution is unique across 1915–2005 and reproduces every published value to
// <1′). Bare JDs on purpose: the positions are geocentric, so birthplaces are
// irrelevant (and unrecorded), like the reference charts above.
const jdA2 = 2436819.5222; // "His" chart
const jdB2 = 2438295.6333; // "Her" chart
const sunA2 = sampleOf(jdA2, Planet.Sun);
const sunB2 = sampleOf(jdB2, Planet.Sun);
const sunMidLon2 = shortArcMidLon(sunA2.lon, sunB2.lon);
const sunMidRa2 = shortArcMidLon(sunA2.ra, sunB2.ra);
const midpointOf = (a, b) => {
  const lon = shortArcMidLon(a.lon, b.lon, sunMidLon2);
  let ra = shortArcMidLon(a.ra, b.ra, sunMidRa2);
  // Mirrors compositeSamples: a near-opposed pair can straddle the antipode
  // differently in the RA frame; the RA midpoint snaps to the side of the
  // longitude of record (quarter-turn test).
  if (Math.abs(wrapPi(ra - lon)) > Math.PI / 2) ra = wrap2pi(ra + Math.PI);
  return { lon, lat: (a.lat + b.lat) / 2, ra, dec: (a.dec + b.dec) / 2 };
};

// The audited bodies with the audit's benchmark values (arcminutes).
// natA/natB: the natal ecliptic latitudes as the audit read them off this app
// (chart-identity check); sfLat/sfDec: the SF composite column.
const AUDIT = [
  { name: 'Moon', body: Planet.Moon, natA: +226, natB: +231, sfLat: +228, sfDec: -896 },
  { name: 'Jupiter', body: Planet.Jupiter, natA: +42, natB: -97, sfLat: -27, sfDec: -405 },
  { name: 'Saturn', body: Planet.Saturn, natA: +46, natB: -75, sfLat: -14, sfDec: -1187 },
  { name: 'Neptune', body: Planet.Neptune, natA: +104, natB: +104, sfLat: +103, sfDec: -775 },
];
const audited = AUDIT.map((t) => {
  const a = sampleOf(jdA2, t.body);
  const b = sampleOf(jdB2, t.body);
  return { ...t, a, b, mid: midpointOf(a, b) };
});

// (8) Chart identity: the natal ecliptic latitudes match the audit's readings
// of the app (±1.5′ display rounding) — proves this really is the benchmark
// couple, so the composite comparisons below are apples-to-apples.
for (const { name, a, b, natA, natB } of audited) {
  check(
    `natal ${name} latitudes match the audited charts`,
    Math.abs(arcmin(a.lat) - natA) < 1.5 && Math.abs(arcmin(b.lat) - natB) < 1.5,
    `A ${fmtDM(a.lat)} (audit ${fmtDM((natA / 60) * D2R)}), B ${fmtDM(b.lat)} (audit ${fmtDM((natB / 60) * D2R)})`,
  );
}

// (9) Composite latitude = plain mean of the natal latitudes, agreeing with the
// SF composite column (±1.5′: SF/MxH round a half-minute opposite ways, and
// their natal inputs differ from ours by ≤1′).
for (const { name, mid, sfLat } of audited) {
  check(
    `composite ${name} latitude = mean of natal latitudes ≈ SF`,
    Math.abs(arcmin(mid.lat) - sfLat) < 1.5,
    `${fmtDM(mid.lat)} vs SF ${fmtDM((sfLat / 60) * D2R)}`,
  );
}

// (10) Composite declination = plain mean of the parents' NATIVE declinations,
// agreeing with the SF composite column (±3′). This is the column no
// point-derived declination can reproduce (see 12).
for (const { name, mid, sfDec } of audited) {
  check(
    `composite ${name} declination = mean of native declinations ≈ SF`,
    Math.abs(arcmin(mid.dec) - sfDec) < 3.0,
    `${fmtDM(mid.dec)} vs SF ${fmtDM((sfDec / 60) * D2R)}`,
  );
}

// (11) Construction identities of the midpoint itself.
{
  const { a, b, mid } = audited[0];
  check(
    'composite lat/dec are the exact per-coordinate means (construction)',
    Math.abs(mid.lat - (a.lat + b.lat) / 2) < 1e-15 &&
      Math.abs(mid.dec - (a.dec + b.dec) / 2) < 1e-15,
  );
}

// (12) Sentinels: the mean declination is NOT the declination of any single
// composite point — neither the old flattened (lonMid, 0) pipeline nor the
// (lonMid, latMean) point reproduces it (the row is not a self-consistent 3D
// point; benchmark programs agree per column, not per point).
{
  // Obliquity at the pair's Davison midpoint — within float noise of any frame
  // moment this chart could store, and the sentinel thresholds are arcminutes.
  const eps = eclEps((jdA2 + jdB2) / 2);
  const moon = audited[0];
  const flattened = decOfEcl(moon.mid.lon, 0, eps);
  check(
    'mean declination departs the old flatten-to-ecliptic value (Moon)',
    Math.abs(arcmin(moon.mid.dec - flattened)) > 10,
    `mean ${fmtDM(moon.mid.dec)} vs flattened ${fmtDM(flattened)}`,
  );
  const jup = audited[1];
  const pointDec = decOfEcl(jup.mid.lon, jup.mid.lat, eps);
  check(
    'mean declination departs the (lonMid, latMean) point value (Jupiter)',
    Math.abs(arcmin(jup.mid.dec - pointDec)) > 60,
    `mean ${fmtDM(jup.mid.dec)} vs point ${fmtDM(pointDec)}`,
  );
}

// (13) Node antipodality holds in ALL FOUR coordinates for the derived SN.
{
  const nnA = sampleOf(jdA2, LunarPoint.MeanNode);
  const nnB = sampleOf(jdB2, LunarPoint.MeanNode);
  const nn = midpointOf(nnA, nnB);
  const sn = { lon: wrap2pi(nn.lon + Math.PI), lat: 0, ra: wrap2pi(nn.ra + Math.PI), dec: -nn.dec };
  check(
    'derived south node antipodal in lon, RA, dec (and lat 0)',
    Math.abs(wrapPi(sn.lon - nn.lon - Math.PI)) < 1e-12 &&
      Math.abs(wrapPi(sn.ra - nn.ra - Math.PI)) < 1e-12 &&
      sn.dec === -nn.dec &&
      Object.is(sn.lat, 0),
  );
}

// (14) The composite RA is equidistant from the two natal RAs on the shorter
// arc (the longitude rule, per coordinate) — Sun and Moon.
for (const [label, a, b, mid] of [
  ['Sun', sunA2, sunB2, { ra: sunMidRa2 }],
  ['Moon', audited[0].a, audited[0].b, audited[0].mid],
]) {
  const dA = Math.abs(wrapPi(mid.ra - a.ra));
  const dB = Math.abs(wrapPi(mid.ra - b.ra));
  check(
    `composite ${label} RA equidistant on the shorter arc`,
    Math.abs(dA - dB) < 1e-12 && dA <= Math.PI / 2 + 1e-12,
    `each side ${(dA * R2D).toFixed(4)}°`,
  );
}

// (15) a/b symmetry of the new coordinates: swapping the parents changes nothing.
{
  const { a, b, mid } = audited[1];
  const swapped = midpointOf(b, a);
  check(
    'a/b symmetry (lat / dec / RA midpoints)',
    Math.abs(swapped.lat - mid.lat) < 1e-15 &&
      Math.abs(swapped.dec - mid.dec) < 1e-15 &&
      Math.abs(wrapPi(swapped.ra - mid.ra)) < 1e-12,
  );
}

// (16) Near-opposition straddle: a pair just short of opposition in longitude
// whose same-sign latitudes stretch the RA separation PAST 180° — the two
// shorter arcs then resolve to opposite sides of the sky, and the quarter-turn
// snap must bring the RA midpoint back to the longitude-of-record side.
{
  const eps = eclEps((jdA2 + jdB2) / 2);
  const raDecOfEcl = (lon, lat) => {
    const x = Math.cos(lat) * Math.cos(lon);
    const y = Math.cos(lat) * Math.sin(lon);
    const z = Math.sin(lat);
    const ye = y * Math.cos(eps) - z * Math.sin(eps);
    const ze = y * Math.sin(eps) + z * Math.cos(eps);
    return { ra: wrap2pi(Math.atan2(ye, x)), dec: Math.atan2(ze, Math.sqrt(x * x + ye * ye)) };
  };
  const mk = (lonDeg, latDeg) => {
    const lon = lonDeg * D2R;
    const lat = latDeg * D2R;
    return { lon, lat, ...raDecOfEcl(lon, lat) };
  };
  const a = mk(0, 5);
  const b = mk(179.6, 5); // Δλ = 179.6° < 180, but ΔRA > 180° (same-sign lats)
  const rawRaMid = shortArcMidLon(a.ra, b.ra);
  const m = midpointOf(a, b);
  check(
    'straddle: raw RA midpoint lands on the wrong side (the hazard is real)',
    Math.abs(wrapPi(rawRaMid - m.lon)) > Math.PI / 2,
    `raw RA mid ${(rawRaMid * R2D).toFixed(1)}° vs lonMid ${(m.lon * R2D).toFixed(1)}°`,
  );
  check(
    'straddle: snapped RA midpoint stays on the longitude-of-record side',
    Math.abs(wrapPi(m.ra - m.lon)) <= Math.PI / 2,
    `snapped RA ${(m.ra * R2D).toFixed(1)}°`,
  );
  check(
    'straddle: snap is a/b symmetric',
    Math.abs(wrapPi(midpointOf(b, a).ra - m.ra)) < 1e-12,
  );
}

// Reference table (feeds the audit reply): the composite positions this math
// produces for the benchmark couple, in the audit's own display format.
console.log('\nComposite positions (coordinate-wise midpoints), benchmark couple:');
console.log('  body      longitude   latitude   declination   natal lats (A, B)');
for (const { name, a, b, mid } of audited) {
  console.log(
    `  ${name.padEnd(8)}  ${fmtZodiac(mid.lon)}   ${fmtDM(mid.lat).padStart(7)}   ${fmtDM(mid.dec).padStart(8)}      ${fmtDM(a.lat)}, ${fmtDM(b.lat)}`,
  );
}

process.exit(failures ? 1 : 0);
