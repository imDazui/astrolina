// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useSyncExternalStore } from 'react';

// Touch-layout + orientation signals as tiny module-singleton stores (mirroring
// planPickerStore): so they work across React roots — the rotate gate mounts on its
// own <body> root, like the plan picker and the PWA install button. CSS keys off
// `@media (pointer: coarse)` directly; React components read these hooks. Each
// matchMedia listener is registered ONCE at import (not inside an effect), so
// React StrictMode's double-invoke can never double-subscribe.

// Wrap a media query as a subscribe/getSnapshot pair for useSyncExternalStore.
function mediaStore(query: string): {
  subscribe: (cb: () => void) => () => void;
  getSnapshot: () => boolean;
} {
  // The app is a pure client SPA, but guard against a non-browser context anyway.
  const mql = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query) : null;
  const listeners = new Set<() => void>();
  mql?.addEventListener('change', () => {
    for (const l of listeners) l();
  });
  return {
    subscribe(cb: () => void): () => void {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    getSnapshot: (): boolean => mql?.matches ?? false,
  };
}

// (pointer: coarse) = the primary input can't hover or point precisely (finger, not
// mouse). This single signal drives the whole touch layout: hidden hover-only views
// + the settings takeover. Deliberately NOT combined with a width breakpoint — a
// large landscape tablet is still a coarse-pointer device and SHOULD get the touch
// layout (you can't hover regardless of screen size).
const touch = mediaStore('(pointer: coarse)');
// Portrait — used only by the rotate gate. We support landscape only for now.
const portrait = mediaStore('(orientation: portrait)');

/** Non-reactive read: is this a coarse-pointer (touch) device? */
export function isTouchLayout(): boolean {
  return touch.getSnapshot();
}
/** Non-reactive read: is the viewport currently portrait? */
export function isPortrait(): boolean {
  return portrait.getSnapshot();
}

/** Reactive read of whether this is a coarse-pointer (touch) device. */
export function useTouchLayout(): boolean {
  return useSyncExternalStore(touch.subscribe, touch.getSnapshot, () => false);
}
/** Reactive read of whether the viewport is currently portrait. */
export function usePortrait(): boolean {
  return useSyncExternalStore(portrait.subscribe, portrait.getSnapshot, () => false);
}
