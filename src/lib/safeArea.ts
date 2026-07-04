// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The BOTTOM safe-area inset (the home-indicator strip when the app draws
// edge-to-edge on a notched phone) as a NUMBER, for the few places that
// compute pixel heights in JS — e.g. a reserved bottom layout band whose
// height feeds <Map bottomInset> and the bottom-dock registry. Plain CSS
// keeps reading env(safe-area-inset-bottom) directly; this is only the JS
// mirror of the same value.
//
// A tiny module-singleton store, mirroring lib/touch.ts: the value comes from
// a hidden fixed probe whose padding-bottom is the env() value (inline style,
// so it needs no stylesheet), resolved to px by getComputedStyle. Re-measured
// on window resize — a rotation always fires one, and iOS updates the insets
// with it. The listener is registered ONCE at import (never in an effect), so
// React StrictMode's double-invoke can never double-subscribe.
import { useSyncExternalStore } from 'react';

let probe: HTMLDivElement | null = null;
let value = 0;
const listeners = new Set<() => void>();

function ensureProbe(): HTMLDivElement | null {
  if (typeof document === 'undefined' || !document.body) return null;
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;bottom:0;width:0;height:0;' +
      'padding-bottom:env(safe-area-inset-bottom,0px);' +
      'visibility:hidden;pointer-events:none;';
    document.body.appendChild(probe);
  }
  return probe;
}

function measure(): void {
  const el = ensureProbe();
  if (!el) return;
  const next = parseFloat(getComputedStyle(el).paddingBottom) || 0;
  if (next === value) return;
  value = next;
  for (const l of listeners) l();
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', measure);
  // Module scripts run after the document parses, so the probe mounts and the
  // first read lands before anything renders.
  measure();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

/** Non-reactive read: the bottom safe-area inset in px (0 off notched phones). */
export function safeAreaBottom(): number {
  return value;
}
/** Reactive read of the bottom safe-area inset in px. */
export function useSafeAreaBottom(): number {
  return useSyncExternalStore(subscribe, () => value, () => 0);
}
