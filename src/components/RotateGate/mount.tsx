// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { createRoot } from 'react-dom/client';
import { RotateGate } from './RotateGate';

// Mount the rotate gate in its OWN React root on <body> — like the plan picker and
// the PWA install button — so it is present from first paint and independent of the
// core App tree (which only renders after the ephemeris finishes loading; a portrait
// user should be told to rotate immediately, not after that wait).
export function mountRotateGate(): void {
  if (document.getElementById('rotate-gate-root')) return; // idempotent
  const host = document.createElement('div');
  host.id = 'rotate-gate-root';
  document.body.appendChild(host);
  createRoot(host).render(<RotateGate />);
}
