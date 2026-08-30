// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Band layout: how a chart wheel spends its radius, checked across every size and
// configuration the app actually renders at.
//
// This is the RADIAL complement to verify-wheel-layout.ts, which checks the
// TANGENTIAL question — that nothing on the glyph ring lands on top of anything
// else going round. Between them they were the blind spot that let this ship:
//
//   • the layout suite assumes ONE radius (rPlanets) and never looks inward, so a
//     collapsing house band or an aspect hub down to 12px was invisible to it;
//   • and it restated the radii by hand with `advanced` pinned false and the
//     readout tier pinned to 440px, so it never modelled a phone at all.
//
// §1–§5 are INTERNAL-IDENTITY checks: the geometry must not contradict itself — a
// slot the solver placed must fit between the two rings the same solver placed it
// between. When one of these breaks, the module is inconsistent with itself.
//
// §4b is neither: it is a REQUIREMENT, asserted because the budget once shed the
// cusp rim on small wheels and that is not a decision the budget gets to make. It
// sits with the identities because it is checked the same way, but a break there
// means someone changed a policy, not that the arithmetic drifted.
//
// §6–§7 are OUTSIDE-AGREEMENT checks: the geometry is measured against what a
// reader needs rather than against its own arithmetic — a house number wants a
// legible arc, an aspect figure wants a real share of the middle, and growing a
// wheel must never take detail away. When one of these breaks, the module is
// perfectly self-consistent and still wrong, which is the failure that produced the
// complaints this replaced. Keeping the two kinds apart is the point: they want
// different responses.
//
// Pure geometry: no React, no DOM, no ephemeris. Calls the same wheelGeometry the
// renderer calls, so there is nothing here that can agree with a stale copy.
//
//   npm run verify:wheel-bands

import { readFileSync } from 'node:fs';
import {
  HUB_TARGET_SHARE,
  houseNumberArcPx,
  wheelGeometry,
  type WheelGeometry,
  type WheelGeometryInput,
} from '../src/lib/wheelGeometry';

// The sizes the app renders a DETAILED wheel at, plus the edges. 280/900 are
// MIN_WHEEL/MAX_WHEEL in ExpandedChartSidebar; 367 is an iPhone SE; ~380 a typical
// portrait phone; 368 the minimap's enlarged size (which IS detailed); 420 the
// bi-wheel's own floor; 760 the report export.
//
// It starts at 280 because nothing renders a detailed wheel below that, and the
// budget genuinely cannot serve one: at 210 with Advanced the cusp rim and the zodiac
// band consume the radius outright and the hub reaches 0%. That is a true statement
// about an unreachable configuration, so sweeping it would assert a requirement on a
// wheel the app never draws — see MINIMAP_SIZES for where 210 is covered.
const SIZES = [
  280, 300, 320, 340, 360, 367, 368, 380, 400, 420, 440, 460, 500, 560, 600, 640,
  700, 760, 800, 860, 900,
];

/** The minimap's own sizes. 210 is ChartWheel's COMPACT_SIZE and is only ever drawn
 *  NON-detailed — no zodiac band, no houses, no readout — so it is swept as that and
 *  nothing else. (Its enlarged 368 is a detailed wheel and lives in SIZES.) */
const MINIMAP_SIZES = [210, ...SIZES];

/** Least arc a house number may be given before it stops being readable, as a
 *  multiple of the font it is drawn at: two tabular digits ("12") ink about 1.1em,
 *  and half an em of daylight either side of that is what keeps twelve of them from
 *  reading as one band of digits.
 *
 *  Font-relative, not a flat pixel figure. A flat one was the first thing written
 *  here (26px) and it is the same mistake as the separation floor it sits next to:
 *  cut against one font size, wrong at every other. The old model gave a phone
 *  12.6px of arc for a 9px number — under the ink itself. */
const MIN_HOUSE_ARC_EM = 1.6;

interface Case {
  label: string;
  input: WheelGeometryInput;
}

const cases: Case[] = [];
for (const size of SIZES) {
  for (const advanced of [false, true]) {
    for (const readouts of [false, true]) {
      cases.push({
        label: `${size}${advanced ? ' adv' : ''}${readouts ? ' forced' : ''}`,
        input: { size, detailed: true, advanced, readouts },
      });
    }
    // The component only offers the overlay at ≥420, so neither does this.
    if (size >= 420) {
      cases.push({
        label: `${size}${advanced ? ' adv' : ''} bi-wheel`,
        input: { size, detailed: true, advanced, hasOverlay: true },
      });
    }
    cases.push({
      label: `${size}${advanced ? ' adv' : ''} planets-only`,
      input: { size, detailed: true, advanced, planetsOnly: true },
    });
  }
}
for (const size of MINIMAP_SIZES) {
  cases.push({ label: `${size} minimap`, input: { size, detailed: false } });
}

let failures = 0;
const fail = (label: string, msg: string) => {
  failures += 1;
  console.log(`FAIL  ${label}: ${msg}`);
};
const px = (v: number) => v.toFixed(1);

// ── §1 Rings decrease outward-in ───────────────────────────────────────────
function checkOrder(label: string, g: WheelGeometry, i: WheelGeometryInput) {
  const chain: [string, number][] = [
    ['R', g.R],
    ['rOuter', g.rOuter],
    ['rZodiacInner', g.rZodiacInner],
  ];
  if (i.hasOverlay) {
    chain.push(['rOverlay', g.rOverlay]);
    if (g.detail.overlayReadout) chain.push(['rOverlayReadout', g.rOverlayReadout]);
  }
  chain.push(['rPlanets', g.rPlanets]);
  if (g.detail.readout) {
    chain.push(['rReadoutDeg', g.rReadoutDeg]);
    chain.push(['rReadoutSign', g.rReadoutSign]);
    chain.push(['rReadoutMin', g.rReadoutMin]);
  }
  chain.push(['houseRingOuter', g.houseRingOuter]);
  chain.push(['houseRingInner', g.houseRingInner]);
  for (let k = 1; k < chain.length; k++) {
    const [an, av] = chain[k - 1];
    const [bn, bv] = chain[k];
    // Non-strict: a shed readout slot deliberately collapses onto the one outside it.
    if (bv > av + 1e-9) fail(label, `${bn} ${px(bv)} is OUTSIDE ${an} ${px(av)}`);
  }
  if (g.houseRingInner < 0) fail(label, `houseRingInner is negative (${px(g.houseRingInner)})`);
}

// ── §2 The readout fits between the glyph disc and the house ring ──────────
// Ink to ink, the same line the tangential suite draws: what must never be crossed
// is the actual mark, not the comfortable gap around it. Cap height rather than
// font size, because a line of tabular numerals inks about 0.72em of the box it is
// measured in, and asserting on the box would fail arrangements that read fine.
const CAP_EM = 0.72;
/** Half the inked height of a line of readout numerals. */
const halfNum = (font: number) => (CAP_EM * font) / 2;
/** Half the inked height of the readout's sign glyph. The NATAL trio draws it at
 *  font + 3 (the overlay's own trio uses font + 2, and is not checked here — its
 *  spacing is governed by overlayFan, not readoutFan). */
const halfSign = (font: number) => (CAP_EM * (font + 3)) / 2;

function checkReadout(label: string, g: WheelGeometry) {
  if (!g.detail.readout) return;
  const f = g.readoutFont;
  const discInner = g.rPlanets - g.discR;
  if (g.rReadoutDeg + halfNum(f) > discInner + 1e-9) {
    fail(label, `degree slot (${px(g.rReadoutDeg + halfNum(f))}) runs into the glyph disc (${px(discInner)})`);
  }
  const innermost = g.detail.readoutMin
    ? g.rReadoutMin - halfNum(f)
    : g.detail.readoutSign
      ? g.rReadoutSign - halfSign(f)
      : g.rReadoutDeg - halfNum(f);
  if (innermost < g.houseRingOuter - 1e-9) {
    fail(label, `readout (${px(innermost)}) runs into the house ring (${px(g.houseRingOuter)})`);
  }
  // A slot that is drawn must clear the one outside it, not stack on it.
  if (g.detail.readoutSign) {
    const need = halfNum(f) + halfSign(f);
    const gap = g.rReadoutDeg - g.rReadoutSign;
    if (gap < need - 1e-9) {
      fail(label, `sign slot inks into the degree slot (gap ${px(gap)} < ${px(need)})`);
    }
  }
  if (g.detail.readoutMin) {
    const need = halfSign(f) + halfNum(f);
    const gap = g.rReadoutSign - g.rReadoutMin;
    if (gap < need - 1e-9) {
      fail(label, `minute slot inks into the sign slot (gap ${px(gap)} < ${px(need)})`);
    }
  }
}

// ── §3 The rim signs fit the band they sit in ──────────────────────────────
function checkSignBand(label: string, g: WheelGeometry) {
  const band = g.rOuter - g.rZodiacInner;
  if (g.signGlyphPx > band * 0.95 + 1e-9) {
    fail(label, `sign glyph ${px(g.signGlyphPx)} does not fit the ${px(band)}px zodiac band`);
  }
}

// ── §4 The cusp readout fits INSIDE the zodiac band ────────────────────────
// It used to be drawn at rOuter + 12, outside the wheel, and the budget reserved a
// 20–22px band out there for it — a fifth of the radius on a phone. It shares the
// band's mid-radius with the sign glyphs now, so what has to hold is that the band
// is tall enough for both kinds of ink, not that the wheel reserved a margin.
function checkCuspRim(label: string, g: WheelGeometry) {
  if (!g.detail.cuspRim) return;
  const band = g.rOuter - g.rZodiacInner;
  // Both are centred on the band's mid-radius, so the taller of the two is what
  // has to fit — the glyph, always, since the readout is the smaller face.
  const tallest = Math.max(g.signGlyphPx, g.cuspRimPx);
  if (tallest > band * 0.95 + 1e-9) {
    fail(label, `band ${px(band)} cannot hold ${px(tallest)} of ink at its mid-radius`);
  }
  // And nothing may sit outside the rim any more.
  if (g.rOuter > g.R - 1e-9) {
    fail(label, `rOuter ${px(g.rOuter)} leaves no breathing margin inside R ${px(g.R)}`);
  }
}

// ── §4b The cusp rim is drawn whenever the chart has one ───────────────────
// Not a geometric property — a REQUIREMENT, and the reason it is asserted rather
// than left to the budget is that the budget shed it once. Under Whole Sign the
// twelve labels all read 0°00' and the ring looks disposable; under the other nine
// house systems each is a distinct value that appears nowhere else on the wheel.
// A phone was the size that lost them, which is the screen where scrolling to the
// table below costs most.
function checkCuspRimAlways(label: string, g: WheelGeometry, i: WheelGeometryInput) {
  if (!i.detailed) return;
  const shouldHave = !!i.advanced && !i.planetsOnly;
  if (g.detail.cuspRim !== shouldHave) {
    fail(
      label,
      `cusp rim is ${g.detail.cuspRim ? 'drawn' : 'OMITTED'} where it should be ` +
        `${shouldHave ? 'drawn' : 'absent'} (advanced=${!!i.advanced}, planetsOnly=${!!i.planetsOnly})`,
    );
  }
}

// ── §4c The twelve cusp units fit the band, and each other ────────────────
// A cusp reads as one unit now — degree, sign glyph, minutes, laid out
// horizontally and centred on the cusp, the way the reference charts annotate a
// cusp. Two things have to hold for that to be drawable at all.
//
// It is deliberately NOT checked against the sign glyphs at their midpoints: the
// band carries one kind of mark at a time. When the units are drawn they carry
// their own sign glyph and the standalone ones are not; when they are not drawn
// (a non-Advanced wheel, the reports export, the minimap) the standalone glyphs
// are the whole band.
function checkBandCrowding(label: string, g: WheelGeometry) {
  if (!g.detail.cuspRim) return;
  // Straight from the geometry — the figure WheelSvg lays the unit out with, not a
  // second estimate of it that could drift from the first.
  const unitHalf = g.cuspUnitHalfPx;
  // 1. The unit is laid ALONG the band, so its furthest point from the centre is
  //    hypot(radius, step) — barely more than the radius itself, which is the whole
  //    reason tangential placement does not need the inward clamp a flat one did.
  //    Still asserted, because it is what makes that true rather than a hope.
  const rMid0 = (g.rZodiacInner + g.rOuter) / 2;
  const reach = Math.hypot(rMid0, g.cuspUnitStepPx) + g.cuspRimPx * 0.6;
  if (reach > g.R + 1e-9) {
    fail(label, `a cusp unit reaches ${px(reach)} against a ${px(g.R)} radius`);
  }
  // 2. Adjacent cusps are 30 deg apart under whole sign — the evenly-spaced case, and
  //    the one every chart in that system hits. Two units must not collide there.
  const rMid = (g.rZodiacInner + g.rOuter) / 2;
  const arc30 = (2 * Math.PI * rMid * 30) / 360;
  if (2 * unitHalf > arc30) {
    fail(label, `two cusp units need ${px(2 * unitHalf)}px where 30 deg of band gives ${px(arc30)}px`);
  }
}
// ── §5 planetsOnly has no house band; everything else has one ──────────────
function checkHouseBand(label: string, g: WheelGeometry, i: WheelGeometryInput) {
  if (i.planetsOnly) {
    if (g.houseBand !== 0) fail(label, `planets-only wheel still has a ${px(g.houseBand)}px house band`);
    return;
  }
  if (!i.detailed) return;
  // The old model let this reach zero, which deleted the house ring, the cusp
  // lines and all twelve numbers with nothing said. It is an assertion now.
  if (g.houseBand <= 0) fail(label, 'house band collapsed to zero');
}

// ── §6 A house number gets a legible arc ───────────────────────────────────
function checkHouseArc(label: string, g: WheelGeometry, i: WheelGeometryInput) {
  if (i.planetsOnly || !i.detailed) return;
  const arc = houseNumberArcPx(g);
  const need = MIN_HOUSE_ARC_EM * g.houseNumPx;
  if (arc < need) {
    fail(label, `${px(arc)}px of arc per house number at ${g.houseNumPx}px (want ≥ ${px(need)})`);
  }
}

// ── §7 The aspect hub keeps its share of the middle ────────────────────────
function checkHub(label: string, g: WheelGeometry, i: WheelGeometryInput) {
  if (!i.detailed) return;
  const share = g.rAspectRing / g.R;
  if (share < HUB_TARGET_SHARE - 1e-9) {
    fail(label, `aspect hub is ${(100 * share).toFixed(1)}% of the radius (want ≥ ${(100 * HUB_TARGET_SHARE).toFixed(0)}%)`);
  }
}

console.log('§1–§5 the geometry does not contradict itself (§4b: the cusp rim is never shed)');
console.log('§6–§7 the geometry gives the reader what the reader needs\n');

for (const c of cases) {
  const g = wheelGeometry(c.input);
  checkOrder(c.label, g, c.input);
  checkReadout(c.label, g);
  if (c.input.detailed) {
    checkSignBand(c.label, g);
    checkCuspRim(c.label, g);
    checkBandCrowding(c.label, g);
  }
  checkCuspRimAlways(c.label, g, c.input);
  checkHouseBand(c.label, g, c.input);
  checkHouseArc(c.label, g, c.input);
  checkHub(c.label, g, c.input);
}
console.log(
  `${failures ? 'FAIL' : 'ok  '}  ${cases.length} size × configuration cases` +
    `, ${failures} problem(s)`,
);

// ── §8 Growing a wheel never takes detail away ─────────────────────────────
// The one an emergent budget cannot promise, and the reason the shed order is
// declared data rather than control flow. A bi-wheel used to lose its natal
// readout on crossing 600px, where the overlay ring became affordable and pushed
// everything else inward — a bigger wheel showing less.
console.log('\ngrowing a wheel never takes detail away');
const rank = (g: WheelGeometry) =>
  (g.detail.cuspRim ? 1 : 0) +
  (g.detail.overlayReadout ? 1 : 0) +
  (g.detail.readout ? 1 : 0) +
  (g.detail.readoutSign ? 1 : 0) +
  (g.detail.readoutMin ? 1 : 0);

for (const advanced of [false, true]) {
  for (const hasOverlay of [false, true]) {
    let regressions = 0;
    let prev: { size: number; g: WheelGeometry } | null = null;
    // Every 2px, not just the listed sizes: a drag handle moves through all of them.
    for (let size = hasOverlay ? 420 : 280; size <= 900; size += 2) {
      const g = wheelGeometry({ size, detailed: true, advanced, hasOverlay });
      if (prev && rank(g) < rank(prev.g)) {
        regressions += 1;
        if (regressions === 1) {
          fail(
            `${advanced ? 'adv' : 'plain'}${hasOverlay ? ' bi-wheel' : ''}`,
            `detail DROPS from ${prev.size}px to ${size}px (rank ${rank(prev.g)} → ${rank(g)})`,
          );
        }
      }
      prev = { size, g };
    }
    const label = `${advanced ? 'adv' : 'plain'}${hasOverlay ? ' bi-wheel' : ''}`;
    console.log(
      `${regressions ? 'FAIL' : 'ok  '}  ${label.padEnd(16)} ${regressions} regression(s) across 280–900px`,
    );
  }
}

// ── A table, so a change to the budget is readable in the diff ─────────────
console.log('\nwhat each size ends up with (Advanced on)');
console.log('size   hub    share  house arc  keeps');
for (const size of [280, 340, 380, 440, 560, 640, 760, 900]) {
  const g = wheelGeometry({ size, detailed: true, advanced: true });
  const keeps = [
    g.detail.cuspRim ? 'rim' : null,
    g.detail.readout
      ? g.detail.readoutMin
        ? 'deg·sign·min'
        : g.detail.readoutSign
          ? 'deg·sign'
          : 'deg'
      : 'no readout',
  ]
    .filter(Boolean)
    .join(' + ');
  console.log(
    `${String(size).padStart(4)}  ${px(g.rAspectRing).padStart(6)}  ` +
      `${((100 * g.rAspectRing) / g.R).toFixed(1).padStart(5)}%  ` +
      `${px(houseNumberArcPx(g)).padStart(9)}  ${keeps}`,
  );
}

// ── §9 No stylesheet may take the ink sizes back ───────────────────────────
// The one check here that reads a FILE rather than the module, and the only thing
// standing between this suite and a repeat of the bug it was written after.
//
// The geometry's font sizes reach the DOM as SVG presentation attributes, which
// carry specificity ZERO — so a single `font-size` in a stylesheet silently wins
// and every figure above becomes a number the suite asserts about and the browser
// never paints. That is not a hypothetical: `.readout-deg { font-size: 10px }` did
// exactly that to `fontSize={readoutFont}` for as long as readoutScale existed, and
// `.capture-extras .astro-glyph { font-size: 1.08em }` flattened every glyph on the
// capture wheel to one size. Nothing in a pure-geometry suite can see either.
console.log('\nno stylesheet takes the ink sizes back');
const cssPath = 'src/components/Wheel/WheelSvg.css';
const css = readFileSync(cssPath, 'utf8');
/** The classes WheelSvg sizes from the geometry. A font-size for any of them wins. */
const SIZED_CLASSES = [
  'house-number',
  'cusp-rim-deg',
  'wheel-angle-label',
  'readout-deg',
  'readout-min',
];
for (const cls of SIZED_CLASSES) {
  // The rule body for `.wheel-svg .<cls> { … }` — non-greedy to the first close brace.
  const m = css.match(new RegExp(`\\.wheel-svg\\s+\\.${cls}\\s*\\{([^}]*)\\}`));
  if (!m) {
    fail(cssPath, `no rule found for .${cls} — has it been renamed?`);
  } else if (/(^|[;{\s])font-size\s*:/.test(m[1])) {
    fail(
      cssPath,
      `.${cls} declares font-size, which beats the geometry's presentation attribute ` +
        `— the wheel will paint that size at EVERY wheel size`,
    );
  }
}
// The glyph classes are sized from the geometry too (signGlyphPx / glyphPx), and
// they are shared with plain HTML spans elsewhere — so what is checked is that no
// rule sizes `.astro-glyph` in a way that also catches the wheel's SVG <text>.
const captureCss = 'src/components/CaptureExtras/CaptureExtras.css';
const capture = readFileSync(captureCss, 'utf8');
for (const m of capture.matchAll(/([^{}]*\.astro-glyph[^{}]*)\{([^}]*)\}/g)) {
  const selector = m[1].trim();
  if (!/font-size\s*:/.test(m[2])) continue;
  // `span.astro-glyph` cannot match an SVG <text>, so it is safe by construction.
  if (/\bspan\.astro-glyph\b/.test(selector)) continue;
  fail(
    captureCss,
    `"${selector}" sizes .astro-glyph without a span qualifier — it will also catch ` +
      `the capture wheel's SVG glyphs and flatten them to one size`,
  );
}
console.log(
  `${failures ? 'FAIL' : 'ok  '}  ${SIZED_CLASSES.length} sized classes + the capture glyph rule`,
);

console.log(failures ? `\n${failures} FAILING CHECK(S)` : '\nall checks pass');
process.exit(failures ? 1 : 0);
