// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import './CycleHotkey.css';

// A hotkey tag for a key that CYCLES through options rather than jumping to a fixed
// one: the key label followed by a circular-arrow glyph. Shared by the Overlay menu
// ("O") and the Projection picker ("Shift F").
export function CycleHotkey({ label }: { label: string }) {
  return (
    <span className="cycle-hotkey">
      {label}
      <svg
        className="cycle-hotkey-icon"
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
      </svg>
    </span>
  );
}
