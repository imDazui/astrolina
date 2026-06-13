// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the interpretation-card catalog stays complete as bodies/stars are
// added (`npm run verify:content`): every computed body carries all four
// bespoke angle readings, every bundled star has a one-line signature (name
// spellings must match the star catalog exactly), and the templates keep the
// placeholders the card builder interpolates.
import { PLANET_NAMES } from '../src/lib/ephemeris';
import { lineMeanings } from '../src/i18n/en/lineMeanings';
import starsJson from '../src/lib/astro/data/stars.json';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

// 1. Every body × angle has a bespoke reading.
{
  const meanings = lineMeanings.meanings as Record<string, Record<string, string>>;
  const missing: string[] = [];
  for (const body of PLANET_NAMES) {
    for (const angle of ['MC', 'IC', 'ASC', 'DSC']) {
      if (!meanings[body]?.[angle]) missing.push(`${body}.${angle}`);
    }
  }
  check(
    `bespoke readings cover all ${PLANET_NAMES.length} bodies × 4 angles`,
    missing.length === 0,
    missing.slice(0, 6).join(', '),
  );
}

// 2. Every catalog star has a signature, and no signature is orphaned.
{
  const catalog = (starsJson as { stars: { name: string }[] }).stars.map((s) => s.name);
  const themes = lineMeanings.starThemes as Record<string, string>;
  const missing = catalog.filter((n) => !themes[n]);
  const orphaned = Object.keys(themes).filter((n) => !catalog.includes(n));
  check(`every catalog star (${catalog.length}) has a signature`, missing.length === 0, missing.join(', '));
  check('no signature is orphaned from the catalog', orphaned.length === 0, orphaned.join(', '));
}

// 3. Templates carry the placeholders the card builder fills.
{
  const needs: Array<[string, string, string[]]> = [
    ['star', lineMeanings.star, ['{star}', '{theme}', '{essence}']],
    ['paran', lineMeanings.paran, ['{a}', '{b}', '{angleA}', '{angleB}', '{themeA}', '{themeB}']],
    ['localSpace', lineMeanings.localSpace, ['{planet}', '{theme}']],
    ['generic', lineMeanings.generic, ['{theme}', '{essence}']],
  ];
  for (const [name, template, slots] of needs) {
    const missing = slots.filter((s) => !template.includes(s));
    check(`template "${name}" keeps its placeholders`, missing.length === 0, missing.join(', '));
  }
}

console.log(failures === 0 ? '\nverify-content: ALL PASS' : `\nverify-content: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
