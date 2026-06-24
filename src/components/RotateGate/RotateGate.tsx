// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useTouchLayout, usePortrait } from '../../lib/touch';
import './RotateGate.css';

// A full-screen "please rotate" overlay shown ONLY on touch devices held in portrait.
// AstroLina supports landscape only (a world map needs the width), so rather than
// build a separate portrait layout we ask the user to turn the device. Rotating to
// landscape flips usePortrait() and this returns null — the gate auto-dismisses.
export function RotateGate() {
  const touch = useTouchLayout();
  const portrait = usePortrait();
  if (!touch || !portrait) return null;
  return (
    <div className="rotate-gate" role="dialog" aria-modal="true" aria-label="Rotate your device to landscape">
      <div className="rotate-gate-card">
        <PhoneRotateIcon />
        <h2 className="rotate-gate-title">Rotate your device</h2>
        <p className="rotate-gate-text">
          AstroLina’s world map needs room to breathe. Turn your device to landscape to continue.
        </p>
      </div>
    </div>
  );
}

// A phone with a static clockwise arrow; the CSS spins the phone in that SAME
// direction, so the arrow always points the way the device is being tilted.
function PhoneRotateIcon() {
  return (
    <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Static direction arrow: a clockwise sweep over the top, head pointing down-right. */}
      <path d="M5 7 A 9 9 0 0 1 19 7" />
      <path d="M19.4 3.7 L19.2 7.4 L15.7 6.6" />
      {/* The phone, animated: portrait, rotating clockwise toward landscape. */}
      <g className="rotate-gate-phone">
        <rect x="8.25" y="7.5" width="7.5" height="12" rx="1.6" />
        <line x1="10.4" y1="17.6" x2="13.6" y2="17.6" />
      </g>
    </svg>
  );
}
