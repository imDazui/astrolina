// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the LOCAL-SPACE × ACG crossing dots of the real src/lib code (run via
// the harness: `npm run verify:crossings`) against an independent oracle that
// intersects the same polylines in UNWRAPPED space, testing each pairing across
// the ±360° world copies. The production path normalizes to [−180,180] and
// splits seam-straddling segments; the June 2026 audit found the previous code
// DROPPED those segments, leaving a blind strip at the antimeridian where
// visibly crossing lines produced no dot (a Fiji-origin chart lost 8 dots; the
// seed chart lost all 18 dots on a Ceres MC line at 179.76°E).
import {
  birthDataToJD,
  getPlanetPositions,
  gmstRadians,
  initEphemeris,
} from '../src/lib/ephemeris';
import { generateLines, normLng, type MeridianLng } from '../src/lib/astro/lines';
import { generateLocalSpace } from '../src/lib/astro/localSpace';
import { generateLocalSpaceCrossings } from '../src/lib/astro/localSpaceCrossings';
import type { BirthData } from '../src/lib/birthData';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

type Pt = [number, number];

// Independent planar intersection in unwrapped space: try the ACG segment at
// its own longitude and shifted by ±360, so a crossing is found in whichever
// world copy the LS segment occupies. No seam normalization, no splitting.
function oracleCrossings(lsCoords: Pt[], acgCoords: Pt[]): Pt[] {
  const hits: Pt[] = [];
  for (let i = 1; i < lsCoords.length; i++) {
    const [ax1, ay1] = lsCoords[i - 1];
    const [ax2, ay2] = lsCoords[i];
    for (let j = 1; j < acgCoords.length; j++) {
      for (const shift of [-360, 0, 360]) {
        const bx1 = acgCoords[j - 1][0] + shift;
        const by1 = acgCoords[j - 1][1];
        const bx2 = acgCoords[j][0] + shift;
        const by2 = acgCoords[j][1];
        const d1x = ax2 - ax1;
        const d1y = ay2 - ay1;
        const d2x = bx2 - bx1;
        const d2y = by2 - by1;
        const denom = d1x * d2y - d1y * d2x;
        if (denom === 0) continue;
        const t = ((bx1 - ax1) * d2y - (by1 - ay1) * d2x) / denom;
        const u = ((bx1 - ax1) * d1y - (by1 - ay1) * d1x) / denom;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        hits.push([normLng(ax1 + t * d1x), ay1 + t * d1y]);
      }
    }
  }
  return hits;
}

await initEphemeris();

// Origins chosen to put lots of geometry near the antimeridian (Fiji) and far
// from it (the seed chart's Yonkers) — the blind strip only ever ate the former.
const CASES: Array<{ label: string; birth: BirthData; origin: [number, number] }> = [
  {
    label: 'Fiji origin (seam-heavy)',
    birth: {
      name: 'fiji', year: 2000, month: 1, day: 1, hour: 12, minute: 0, tzOffset: 0,
      birthplace: { label: 'Suva', lat: -18.14, lng: 178.44 },
    },
    origin: [-18.14, 178.44],
  },
  {
    label: 'Yonkers origin (seed chart)',
    birth: {
      name: 'lewis', year: 1941, month: 6, day: 5, hour: 9, minute: 30, tzOffset: -4,
      birthplace: { label: 'Yonkers', lat: 40.9312, lng: -73.8988 },
    },
    origin: [40.9312, -73.8988],
  },
];

for (const c of CASES) {
  const jd = birthDataToJD(c.birth);
  const gmst = gmstRadians(jd);
  const meridianLng: MeridianLng = (ra) => ((ra - gmst) * 180) / Math.PI;
  const positions = getPlanetPositions(jd, 'mean');
  const lines = generateLines(positions, meridianLng);
  const ls = generateLocalSpace(positions, gmst, c.origin[0], c.origin[1]);
  const dots = generateLocalSpaceCrossings(ls, lines);
  const dotPts = dots.features.map((f) => f.geometry.coordinates as Pt);

  // Every oracle crossing must have a production dot nearby (and the production
  // set must not invent dots the oracle can't see).
  let missing = 0;
  let firstMiss = '';
  let oracleTotal = 0;
  for (const lsf of ls.features) {
    for (const af of lines.features) {
      const hits = oracleCrossings(
        lsf.geometry.coordinates as Pt[],
        af.geometry.coordinates as Pt[],
      );
      oracleTotal += hits.length;
      for (const [hx, hy] of hits) {
        const found = dotPts.some(
          ([dx, dy]) => Math.abs(normLng(dx - hx)) < 0.3 && Math.abs(dy - hy) < 0.3,
        );
        if (!found) {
          missing += 1;
          if (!firstMiss) {
            firstMiss = `${lsf.properties.planet}(${lsf.properties.direction}) × ${af.properties.planet} ${af.properties.lineType} @ (${hx.toFixed(2)}, ${hy.toFixed(2)})`;
          }
        }
      }
    }
  }
  let extra = 0;
  for (const [dx, dy] of dotPts) {
    let found = false;
    for (const lsf of ls.features) {
      if (found) break;
      for (const af of lines.features) {
        const hits = oracleCrossings(
          lsf.geometry.coordinates as Pt[],
          af.geometry.coordinates as Pt[],
        );
        if (hits.some(([hx, hy]) => Math.abs(normLng(dx - hx)) < 0.3 && Math.abs(dy - hy) < 0.3)) {
          found = true;
          break;
        }
      }
    }
    if (!found) extra += 1;
  }

  check(
    `${c.label}: every visible crossing has a dot (${oracleTotal} oracle crossings, ${dotPts.length} dots)`,
    missing === 0,
    missing ? `${missing} missing, first: ${firstMiss}` : '',
  );
  check(`${c.label}: no phantom dots`, extra === 0, extra ? `${extra} extra` : '');
}

console.log(failures === 0 ? '\nverify-crossings: ALL PASS' : `\nverify-crossings: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
