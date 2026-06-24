// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// A 4-way move/drag glyph for the TOUCH "drag" gestures (Touch & drag, Two-finger drag)
// in the mission guide — distinct from the finger TapIcon and the PinchIcon.
export function DragIcon({ className }: { className?: string }) {
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
      <path d="M12 3v18M3 12h18" />
      <path d="M9.5 5.5 12 3l2.5 2.5" />
      <path d="M9.5 18.5 12 21l2.5-2.5" />
      <path d="M5.5 9.5 3 12l2.5 2.5" />
      <path d="M18.5 9.5 21 12l-2.5 2.5" />
    </svg>
  );
}
