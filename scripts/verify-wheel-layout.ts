// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Ring layout: nothing on a chart wheel's glyph ring may overlap anything else,
// and the angle codes (As/Ds/Mc/Ic/Vx/Avx) must keep the exact spot where their
// axis crosses the ring.
//
// Those two pull against each other, which is why this is worth asserting rather
// than eyeballing: the second is what makes the first hard, and the cases where
// it breaks are the ones nobody opens by hand — a stellium landing on the
// Midheaven, the Vertex axis switched on, a polar chart where the Midheaven and
// the Ascendant are three degrees apart, the minor bodies all on at the narrowest
// sidebar width. Every one of those was failing at some point while this was
// written.
//
// Pure geometry: no ephemeris, no DOM. Bodies are placed by longitude alone, so
// generated charts are as good as real ones for the question being asked.
//
//   npm run verify:wheel-layout

import {
  BODY_OVERLAP_SHARE,
  RING_PAD_PX,
  arcDeg,
  placeOnRing,
  type RingMark,
} from '../src/lib/ringLayout';
import {
  angleLabelHalfPx,
  wheelGeometry,
  type WheelGeometry,
} from '../src/lib/wheelGeometry';

// ── The wheel's own figures, from the wheel's own module ───────────────────
// These used to be restated here: an em table copied out of WheelSvg, a DISC_HALF
// hardcoded at 11 + 1.3/2, and a geom() that recomputed every radius with
// `advanced` pinned false and the readout tier pinned to 440px.
//
// That is how this suite stayed green straight through a phone-sized wheel whose
// aspect hub had collapsed to 12px and whose house band could reach zero: it was
// asserting against figures the app had stopped using. A restated formula is a
// copy of the code under test, and it passes when both are wrong in the same way.
//
// The geometry now comes from the same function the renderer calls, so a change to
// the band budget lands here as a failure rather than as a test agreeing with its
// own copy of the old numbers.
const geom = (size: number, advanced: boolean): WheelGeometry =>
  wheelGeometry({ size, detailed: true, advanced });

const angles4 = (asc: number, mc: number): [string, number][] => [
  ['As', asc], ['Ds', (asc + 180) % 360], ['Mc', mc], ['Ic', (mc + 180) % 360],
];
const angles6 = (asc: number, mc: number, vx: number): [string, number][] => [
  ...angles4(asc, mc), ['Vx', vx], ['Avx', (vx + 180) % 360],
];
const marks = (codes: [string, number][], bodies: [string, number][], g: WheelGeometry) => ({
  fixed: codes.map(([name, off]): RingMark => ({
    name,
    off,
    half: angleLabelHalfPx(name, g.angleCodePx, g.angleCodeHalo),
  })),
  movable: bodies.map(([name, off]): RingMark => ({ name, off, half: g.discHalf })),
});

interface Audit {
  /** Pairs closer than they are allowed to be. Two BODIES may share
   *  BODY_OVERLAP_SHARE of their combined width — a third of a glyph clipped beats
   *  a planet pushed across a house cusp, and the glyphs stay distinguishable. A
   *  pair involving an angle CODE may not overlap at all: the code is drawn with a
   *  panel-coloured halo that erases what it lands on, so an overlap there deletes
   *  the other mark rather than crowding it. */
  overlaps: string[];
  /** Pairs that ended up closer than FULL clearance — i.e. actually sharing ink,
   *  within the tolerance. The tolerance is a last resort, so this counts how often
   *  the last resort was reached; on a chart with room it should be zero. */
  sharedInk: number;
  /** How far the furthest body ended up from its true longitude, in degrees. Not
   *  asserted — reported, because it is the cost the tolerance above is buying
   *  down, and a number nobody was watching is how it reached 69° on a phone. */
  maxPushDeg: number;
  movedCodes: string[];
  /** Total ink round the ring — reported, not asserted on. */
  inkDeg: number;
  /** What the ring actually DEMANDS: every adjacent pair's clearance, which is
   *  ink plus RING_PAD_PX plus the minimum separation floor — the same figure
   *  placeOnRing computes. Past 360° no arrangement can satisfy every pair, and
   *  the layout deliberately shrinks the requirements and accepts an overlap.
   *
   *  This used to be measured as inkDeg, which counts the ink and nothing else. A
   *  ring can be well under 360° of ink and still be unsatisfiable once the pad and
   *  the separation floor are charged — so the suite was calling those cases
   *  failures when the layout was doing exactly what it says it does under load. */
  demandDeg: number;
  dropped: boolean;
}
function audit(
  fixed: RingMark[],
  movable: RingMark[],
  out: Map<string, number>,
  rPlanets: number,
  sep: number,
): Audit {
  const all = [...fixed, ...movable].map((m) => ({ ...m, at: out.get(m.name) }));
  if (all.some((m) => m.at === undefined)) {
    return {
      overlaps: [],
      movedCodes: [],
      sharedInk: 0,
      maxPushDeg: 0,
      inkDeg: 0,
      demandDeg: 0,
      dropped: true,
    };
  }
  const s = all.sort((a, b) => a.at! - b.at!);
  const codeNames = new Set(fixed.map((m) => m.name));
  const overlaps: string[] = [];
  let demandDeg = 0;
  let sharedInk = 0;
  for (let i = 0; i < s.length && s.length > 1; i++) {
    const a = s[i];
    const b = s[(i + 1) % s.length];
    demandDeg += Math.max(sep, arcDeg(a.half + b.half + RING_PAD_PX, rPlanets));
    const gapPx = ((((((b.at! - a.at!) % 360) + 360) % 360) * Math.PI) / 180) * rPlanets;
    // Ink to ink, less whatever overlap this pair is allowed. The hairline pad and
    // the readout floor are comfort, not correctness; THIS is the line that must
    // never be crossed — and where a code is involved it is the full ink, because
    // the halo erases rather than crowds.
    const bothBodies = !codeNames.has(a.name) && !codeNames.has(b.name);
    if (bothBodies && gapPx + 1e-6 < a.half + b.half) sharedInk += 1;
    const allowed = (a.half + b.half) * (bothBodies ? 1 - BODY_OVERLAP_SHARE : 1);
    if (gapPx + 1e-6 < allowed) {
      overlaps.push(
        `${a.name}|${b.name} ${gapPx.toFixed(1)}px < ${allowed.toFixed(1)}px` +
          `${bothBodies ? ` (tolerated ${(100 * BODY_OVERLAP_SHARE).toFixed(0)}%)` : ' (code — no tolerance)'}`,
      );
    }
  }
  // The push is measured against where the mark ASKED to be, on the short way round.
  const push = (m: { name: string; off: number }) =>
    Math.abs(((out.get(m.name)! - m.off + 540) % 360) - 180);
  const maxPushDeg = movable.length ? Math.max(...movable.map(push)) : 0;
  return {
    overlaps,
    sharedInk,
    maxPushDeg,
    movedCodes: fixed
      .filter((f) => Math.abs(((out.get(f.name)! - f.off + 540) % 360) - 180) > 1e-6)
      .map((f) => f.name),
    inkDeg: all.reduce((n, m) => n + arcDeg(2 * m.half, rPlanets), 0),
    demandDeg,
    dropped: false,
  };
}

let failures = 0;
function check(
  label: string,
  size: number,
  codes: [string, number][],
  bodies: [string, number][],
  codesMustHold = true,
  advanced = false,
) {
  const g = geom(size, advanced);
  const { rPlanets, ringSep: sep } = g;
  const { fixed, movable } = marks(codes, bodies, g);
  const r = audit(fixed, movable, placeOnRing(fixed, movable, sep, rPlanets, g.bodyOverlap), rPlanets, sep);
  const ok = !r.dropped && r.overlaps.length === 0 && (!codesMustHold || r.movedCodes.length === 0);
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${label}` +
      `  [${size}px${advanced ? ' adv' : ''}, codes held: ${r.movedCodes.length === 0 ? 'all' : `all but ${r.movedCodes.join(',')}`}` +
      `, worst push ${r.maxPushDeg.toFixed(1)}°` +
      `, overlaps: ${r.overlaps.length}]`,
  );
  if (r.dropped) console.log('        a mark was dropped from the layout');
  r.overlaps.slice(0, 4).forEach((o) => console.log('        ' + o));
}

const TEN = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
const ALL19 = [...TEN, 'NorthNode', 'SouthNode', 'Lilith', 'Chiron', 'Ceres', 'Pallas', 'Juno', 'Vesta', 'Fortune'];
const at = (names: string[], lons: number[]): [string, number][] =>
  names.map((n, i) => [n, lons[i]]);

console.log('the codes hold their axis, and nothing overlaps');
check('bodies well spread', 560, angles4(0, 272), at(TEN, [12, 40, 66, 95, 130, 165, 200, 232, 300, 335]));
check('bodies exactly ON the As and the Mc', 560, angles4(0, 272), at(TEN, [0, 1, 272, 273, 130, 165, 200, 232, 300, 335]));
check('stellium straddling the Mc', 800, angles4(0, 272), at(TEN, [268, 270, 271, 272, 274, 276, 165, 200, 300, 335]));
check('Vertex axis on, narrowest sidebar', 320, angles6(0, 272, 47), at(TEN, [5, 44, 50, 95, 130, 165, 200, 232, 300, 335]));
// The reported configuration: a portrait phone gives the wheel ~380px, and these
// users had Advanced on. Neither the size nor the flag was covered before.
check('phone wheel, Advanced on', 380, angles4(0, 272), at(TEN, [12, 40, 66, 95, 130, 165, 200, 232, 300, 335]), true, true);
check('phone wheel, Advanced, stellium on the Mc', 380, angles4(0, 272), at(TEN, [268, 270, 271, 272, 274, 276, 165, 200, 300, 335]), true, true);
// Over-subscribed on purpose: five of the nineteen fall in the 47° arc between the
// As and the Vx, which needs 61°. The codes cannot all hold, and the suite says so
// rather than pretending otherwise — what is still asserted is that nothing overlaps.
check('phone wheel, Advanced, all 19 bodies', 380, angles6(0, 272, 47), at(ALL19, [12, 20, 28, 36, 44, 95, 130, 165, 200, 232, 250, 268, 285, 300, 315, 330, 340, 350, 5]), false, true);
check('smallest sidebar, Advanced on', 280, angles4(0, 272), at(TEN, [12, 40, 66, 95, 130, 165, 200, 232, 300, 335]), true, true);
check('every body conjunct some angle', 700, angles4(0, 90), at(TEN, [0, 0.4, 0.8, 1.2, 90, 90.4, 180, 180.4, 270, 270.4]));
check('no angle marks at all', 560, [], at(TEN, [10, 11, 12, 13, 14, 120, 121, 240, 241, 242]));
check('one body, one angle', 560, [['Mc', 100]], at(['Sun'], [100]));

console.log('\npolar chart: the Mc is 3° from the As, so the codes CANNOT all hold');
check('Mc 3° from As', 560, angles4(0, 3), at(TEN, [90, 120, 150, 180, 210, 240, 270, 300, 330, 45]), false);
check('Mc 1° from As, a body in the sliver', 560, angles4(0, 1), at(TEN, [0.5, 120, 150, 180.5, 210, 240, 270, 300, 330, 45]), false);

// ── Generated charts ──────────────────────────────────────────────────────
// Deterministic (fixed seed) so a failure is reproducible.
let seed = 987654321;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function sweep(
  label: string,
  n: number,
  gen: () => {
    size: number;
    codes: [string, number][];
    bodies: [string, number][];
    advanced: boolean;
  },
) {
  let bad = 0;
  let full = 0;
  let yielded = 0;
  let worstPush = 0;
  let overSign = 0;
  let touching = 0;
  for (let t = 0; t < n; t++) {
    const { size, codes, bodies, advanced } = gen();
    const g = geom(size, advanced);
    const { rPlanets, ringSep: sep } = g;
    const { fixed, movable } = marks(codes, bodies, g);
    const r = audit(fixed, movable, placeOnRing(fixed, movable, sep, rPlanets, g.bodyOverlap), rPlanets, sep);
    if (r.dropped) bad += 1;
    else if (r.demandDeg > 360) full += 1;
    else {
      if (r.overlaps.length) bad += 1;
      if (r.movedCodes.length) yielded += 1;
      worstPush = Math.max(worstPush, r.maxPushDeg);
      // 30° is a whole sign. Past it a body is certainly drawn in a house it is
      // not in, which is the cost BODY_OVERLAP_SHARE exists to buy down — so it
      // is counted rather than left to be noticed in a screenshot.
      if (r.maxPushDeg > 30) overSign += 1;
      if (r.sharedInk > 0) touching += 1;
    }
  }
  if (bad) failures += 1;
  console.log(
    `${bad ? 'FAIL' : 'ok  '}  ${label}: ${n} charts, ${bad} overlapping` +
      `, ${full} rings that cannot satisfy every clearance` +
      `, ${yielded} (${((100 * yielded) / n).toFixed(1)}%) where a code had to yield` +
      `
        worst push ${worstPush.toFixed(1)}°, ${overSign} chart(s) with a body pushed past a whole sign` +
      `, ${touching} where a pair had to share ink`,
  );
}

console.log('\ngenerated charts');
sweep('adversarial (angles anywhere, bodies bunched)', 5000, () => {
  const size = [280, 300, 340, 380, 440, 500, 560, 700, 800, 900][Math.floor(rnd() * 10)];
  const advanced = rnd() < 0.5;
  const asc = rnd() * 360;
  const codes = rnd() < 0.5 ? angles4(asc, rnd() * 360) : angles6(asc, rnd() * 360, rnd() * 360);
  const count = 4 + Math.floor(rnd() * 16);
  const tight = rnd() < 0.5;
  const centre = rnd() * 360;
  return {
    size,
    advanced,
    codes,
    bodies: ALL19.slice(0, count).map((n): [string, number] => [
      n,
      tight ? (centre + rnd() * 50) % 360 : rnd() * 360,
    ]),
  };
});
sweep('realistic (Mc 55–125° from As, inner bodies near the Sun)', 5000, () => {
  const size = [340, 380, 440, 500, 560, 700, 800][Math.floor(rnd() * 7)];
  const advanced = rnd() < 0.5;
  const asc = rnd() * 360;
  const mc = (asc + 55 + rnd() * 70) % 360;
  const codes = rnd() < 0.5 ? angles4(asc, mc) : angles6(asc, mc, (asc + 120 + rnd() * 120) % 360);
  const count = rnd() < 0.35 ? 19 : 10;
  const sun = rnd() * 360;
  return {
    size,
    advanced,
    codes,
    bodies: ALL19.slice(0, count).map((n, i): [string, number] => [
      n,
      (((i < 3 ? sun + (rnd() - 0.5) * 90 : rnd() * 360) % 360) + 360) % 360,
    ]),
  };
});


// ── Resizing the wheel ─────────────────────────────────────────
// A wheel is resized CONTINUOUSLY — a dragged sidebar, a rotated phone, a window
// pulled wider — so the layout has to be a continuous function of its size. Nothing
// above asserts that. Every check so far looks at one size and asks whether that
// answer is good, and a layout can pass all of them at 620px and all of them at
// 700px while putting a body on opposite sides of its notch in the two.
//
// Which is what it did. The re-centring pass that used to follow the relaxation
// grouped marks into runs by whether they were sitting at their requirement, slid
// each run to its members’ mean, and could not ungroup: a body nudged a single
// degree into the run ahead of it then paid that run’s whole shift. Whether it was
// nudged turned on a hair, so the drawn answer jumped. On the chart this was
// reported from, Venus sat on its notch at 620px and at 900px and 7–8° away at 700px
// and 800px, and a reader widening the sidebar watched it flip back and forth.
//
// This is the property that reader sees, asserted directly rather than through a
// figure restated from the solver. Two discontinuities are declared and excluded,
// and only two:
//
//   • the shed ladder swapping rungs. The wheel is drawing a different set of
//     things either side of that step, so its marks are entitled to move.
//   • a ring so full that the angle codes had to give up their axis. placeOnRing
//     says so by moving them, and in that regime there is no stable arrangement to
//     be continuous about.
//
// What is left is every ordinary chart, and it must not move. 5° is the bound
// because the readout font and the glyph disc STEP with the wheel (11px to 12px at
// 620px, and so on), and a mark whose width jumps drags its neighbours; measured
// across 200 charts and the whole 280–900px range the worst is 4.9°, every one of
// them at a font step. The layout itself contributes nothing: 96% of one-pixel
// steps move every body by less than a quarter of a degree.
const detailKey = (g: WheelGeometry) =>
  [g.detail.readout, g.detail.readoutSign, g.detail.readoutMin, g.detail.cuspRim].join(',');

const MAX_RESIZE_JUMP_DEG = 5;

function resizeSweep(label: string, charts: number, bodyCount: number) {
  let worst = 0;
  let worstAt = '';
  let compared = 0;
  let quiet = 0;
  for (let c = 0; c < charts; c++) {
    const advanced = rnd() < 0.5;
    const asc = rnd() * 360;
    const mc = (asc + 55 + rnd() * 70) % 360;
    const codes = angles4(asc, mc);
    const sun = rnd() * 360;
    const bodies = ALL19.slice(0, bodyCount).map((name, i): [string, number] => [
      name,
      (((i < 3 ? sun + (rnd() - 0.5) * 90 : rnd() * 360) % 360) + 360) % 360,
    ]);
    const at = (size: number) => {
      const g = geom(size, advanced);
      const { fixed, movable } = marks(codes, bodies, g);
      const out = placeOnRing(fixed, movable, g.ringSep, g.rPlanets, g.bodyOverlap);
      const held = fixed.every(
        (m) => Math.abs(((out.get(m.name)! - m.off + 540) % 360) - 180) <= 1e-6,
      );
      return { out, held, key: detailKey(g) };
    };
    let prev = at(280);
    for (let size = 281; size <= 900; size++) {
      const cur = at(size);
      const comparable = prev.key === cur.key && prev.held && cur.held;
      if (comparable) {
        compared += 1;
        let jump = 0;
        let who = '';
        for (const [name] of bodies) {
          const a = prev.out.get(name);
          const b = cur.out.get(name);
          if (a === undefined || b === undefined) continue;
          const d = Math.abs(((b - a + 540) % 360) - 180);
          if (d > jump) {
            jump = d;
            who = name;
          }
        }
        if (jump <= 0.25) quiet += 1;
        if (jump > worst) {
          worst = jump;
          worstAt = `${size - 1}→${size}px, ${who}`;
        }
      }
      prev = cur;
    }
  }
  const ok = worst <= MAX_RESIZE_JUMP_DEG;
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${label}: ${compared} one-pixel steps` +
      `, worst move ${worst.toFixed(2)}° (${worstAt})` +
      `, ${((100 * quiet) / compared).toFixed(1)}% moved nothing`,
  );
}

console.log('\nresizing one pixel at a time does not move a body across its notch');
resizeSweep('ten bodies, 280–900px', 60, 10);
resizeSweep('all nineteen, 280–900px', 40, 19);
console.log(failures ? `\n${failures} FAILING CHECK(S)` : '\nall checks pass');
process.exit(failures ? 1 : 0);
