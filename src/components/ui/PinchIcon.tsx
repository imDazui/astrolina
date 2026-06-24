// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// A "pinch" glyph (two arrows converging on the diagonal) for the TOUCH pinch-to-zoom
// gesture in the mission guide.
export function PinchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 4l6 6" />
      <path d="M10 6v4H6" />
      <path d="M20 20l-6-6" />
      <path d="M14 18v-4h4" />
    </svg>
  );
}
