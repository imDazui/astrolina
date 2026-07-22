// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// How wide a hover-tip card is allowed to get, decided from the copy it carries.
//
// Every tip used to share ONE narrow cap (~220-240px). That reads fine for a
// six-word hint, but a paragraph-length one wrapped into a tall, skinny column —
// forty-odd characters per line over eight lines, which is a worse read than the
// wall of text it was trying to tame. The cap now steps up with the length of the
// longest run of copy, so a short hint still gets a compact card and a long one
// gets a shape you can actually read.
//
// The first step is deliberately the app's HISTORICAL cap, and covers everything
// up to a long sentence. Most tips live there and must render exactly as they
// always have — this rule exists to rescue the paragraph-length outliers, not to
// re-flow the whole app. Only copy past that point steps up, and only modestly.
//
// They are a max, not a width: a card still shrinks to fit copy narrower than its
// cap, so a three-word hint is untouched by any of this.
//
// Callers pair this with a viewport clamp (see tipMaxWidthStyle) — a wide card
// near a screen edge would otherwise be nudged bodily on-screen and sit over its
// own trigger.
import type { ReactNode } from 'react';

/** Longest string among the card's text runs; non-string nodes (glyph rows,
 *  element hints) can't be measured here and simply don't raise the cap. */
function longestRun(runs: ReactNode[]): number {
  let longest = 0;
  for (const run of runs) {
    if (typeof run === 'string' && run.length > longest) longest = run.length;
  }
  return longest;
}

/** The width cap (px) for a tip carrying these runs of copy. */
export function tipMaxWidth(...runs: ReactNode[]): number {
  const n = longestRun(runs);
  if (n <= 180) return 240; // up to a long sentence — the historical card, unchanged
  if (n <= 300) return 265;
  return 285;
}

/** Ready-to-spread inline style: the length-based cap, clamped so the card can
 *  never be wider than the viewport it has to sit in. Inline because the cap is
 *  per-card — a stylesheet rule can't see the copy. */
export function tipMaxWidthStyle(...runs: ReactNode[]): { maxWidth: string } {
  return { maxWidth: `min(${tipMaxWidth(...runs)}px, calc(100vw - 16px))` };
}
