// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import type { ChartTag } from '../../lib/chartLibrary';

// The little glyph that marks a chart's tag — shown as a prefix on chart names (the
// My Charts list and the top-bar picker), on the form's star toggle, and on the filter
// chips. It carries its own `tag-glyph tag-glyph--<tag>` classes, which set the intrinsic
// colour (gold star, slate planet) in index.css; callers pass `className` for size/spacing
// only. 'none' renders nothing.
export function TagIcon({ tag, className }: { tag: ChartTag; className?: string }) {
  const cls = ['tag-glyph', `tag-glyph--${tag}`, className]
    .filter(Boolean)
    .join(' ');
  if (tag === 'star') {
    return (
      <svg
        className={cls}
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 2l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.97l-5.88 3.09 1.12-6.55L2.48 8.92l6.58-.96L12 2z" />
      </svg>
    );
  }
  if (tag === 'space') {
    // A ringed planet: a filled disc crossed by a tilted orbit ring.
    return (
      <svg
        className={cls}
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />
        <ellipse cx="12" cy="12" rx="10" ry="3.4" transform="rotate(-25 12 12)" />
      </svg>
    );
  }
  return null;
}
