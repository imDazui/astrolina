// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useRef, useState } from 'react';

// Touch has no hover, so a press-and-hold is the closest analog to "intent to
// inspect": hold a trigger this long (ms) and its tip appears; release or scroll
// away dismisses it. ~450ms is the common long-press threshold (Material/MUI sit
// in the 500-700ms range; a touch a hair quicker still reads as deliberate).
const LONG_PRESS_MS = 450;
// A finger that travels past this (px) before the hold completes is scrolling or
// dragging, not holding — cancel the pending tip.
const MOVE_CANCEL_PX = 10;
// After any touch the browser synthesizes mouse events (mouseenter → … → click).
// Ignore the emulated mouse "show" for this long so a plain tap can't flash the
// tip — on touch ONLY a long-press reveals it. A real hover or keyboard focus
// (no recent touch) is unaffected.
const EMULATED_MOUSE_MS = 700;

export type TipPlacement = 'left' | 'top' | 'bottom' | 'bottom-start' | 'right';

export interface TipPos {
  left: number;
  top: number;
}

// Compute where a tip should sit for a given trigger rect + placement. 'left'
// pops to the trigger's left and 'right' to its right (both vertically centred,
// for edge-docked chrome like the sidebars, minimap, and zoom controls); 'bottom'
// pops below, horizontally centred (the top bar). Coordinates are viewport-
// relative — the card is position: fixed and portaled to <body>, so nothing clips it.
export function tipPosFor(r: DOMRect, placement: TipPlacement): TipPos {
  if (placement === 'bottom') {
    return { left: r.left + r.width / 2, top: r.bottom + 8 };
  }
  if (placement === 'bottom-start') {
    return { left: r.left, top: r.bottom + 8 };
  }
  if (placement === 'right') {
    return { left: r.right + 8, top: r.top + r.height / 2 };
  }
  if (placement === 'top') {
    return { left: r.left + r.width / 2, top: r.top - 8 };
  }
  return { left: r.left - 8, top: r.top + r.height / 2 };
}

// Bind "hold to reveal" tip behavior to a DOM element — the shared touch kernel for
// both useHoverTip (React triggers) and imperative DOM (e.g. MapLibre's nav buttons,
// which aren't React-rendered so can't take the hook's ref). `show` reveals the tip
// (it positions + displays); `hide` dismisses it. A hold past LONG_PRESS_MS reveals
// and arms click-suppression so the release-click can't also activate the control;
// movement (a scroll) or an early release cancels, leaving a plain tap to act as
// usual. Returns a cleanup, plus recentTouch() — true just after a touch — so a
// caller wiring its own hover/focus can mute the emulated mouse a tap fires.
//
// `pointer: true` also wires mouse/focus internally (muted via recentTouch) — handy
// for plain DOM. useHoverTip leaves it false because its React consumers wire
// onMouseEnter/Leave + onFocus/Blur themselves (and guard with recentTouch).
export function bindTouchTip(
  el: HTMLElement,
  show: () => void,
  hide: () => void,
  { pointer = false }: { pointer?: boolean } = {},
): { cleanup: () => void; recentTouch: () => boolean } {
  let touchedAt = 0;
  let timer: number | null = null;
  let start: { x: number; y: number } | null = null;
  let suppressClick = false;
  const clear = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const recentTouch = () => Date.now() - touchedAt < EMULATED_MOUSE_MS;
  const onStart = (e: TouchEvent) => {
    touchedAt = Date.now();
    suppressClick = false;
    const t = e.touches[0];
    start = t ? { x: t.clientX, y: t.clientY } : null;
    clear();
    timer = window.setTimeout(() => {
      timer = null;
      suppressClick = true; // the release-click is consumed by the hold
      show();
    }, LONG_PRESS_MS);
  };
  const onMove = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!start || !t) return;
    if (
      Math.abs(t.clientX - start.x) > MOVE_CANCEL_PX ||
      Math.abs(t.clientY - start.y) > MOVE_CANCEL_PX
    ) {
      clear(); // scrolling/dragging, not holding
      hide();
    }
  };
  const onEnd = () => {
    touchedAt = Date.now();
    clear();
    hide();
  };
  // Swallow exactly the one click a completed long-press would otherwise fire. A
  // capture-phase listener that stops propagation runs before React's delegated
  // click reaches the trigger's own onClick, so the control isn't activated. Only
  // armed by a fired long-press; a plain tap leaves the flag false and clicks act.
  const onClickCapture = (e: MouseEvent) => {
    if (!suppressClick) return;
    suppressClick = false;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  };
  // Muted hover/focus for the plain-DOM path (skipped right after a touch so a tap
  // can't flash the tip via the emulated mouseenter).
  const onEnter = () => {
    if (!recentTouch()) show();
  };
  // touchstart/move stay passive (we never preventDefault them, so scrolling is
  // untouched); suppression is handled entirely on the click above.
  el.addEventListener('touchstart', onStart, { passive: true });
  el.addEventListener('touchmove', onMove, { passive: true });
  el.addEventListener('touchend', onEnd);
  el.addEventListener('touchcancel', onEnd);
  el.addEventListener('click', onClickCapture, true);
  if (pointer) {
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', hide);
    el.addEventListener('focus', onEnter);
    el.addEventListener('blur', hide);
  }
  return {
    recentTouch,
    cleanup: () => {
      clear();
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('click', onClickCapture, true);
      if (pointer) {
        el.removeEventListener('mouseenter', onEnter);
        el.removeEventListener('mouseleave', hide);
        el.removeEventListener('focus', onEnter);
        el.removeEventListener('blur', hide);
      }
    },
  };
}

// Convenience for React triggers: a ref + hover/focus handlers that drive the tip
// position. Consumers wire show/hide to onMouseEnter/Leave + onFocus/Blur as before;
// touch is handled transparently — the hook binds the shared long-press kernel
// (bindTouchTip) to the same ref, so every tip gains "hold to reveal" with no
// per-call wiring. (Plain DOM triggers that aren't React-rendered call bindTouchTip
// directly instead — see the MapLibre nav-control tips in Map.tsx.)
export function useHoverTip<T extends HTMLElement>(placement: TipPlacement = 'left') {
  const ref = useRef<T>(null);
  const [pos, setPos] = useState<TipPos | null>(null);
  // Latest placement, read at show-time, so the mount-once touch effect below
  // always positions with the current value even if a consumer passes a dynamic
  // one. Synced in an effect (refs mustn't be written during render).
  const placementRef = useRef(placement);
  useEffect(() => {
    placementRef.current = placement;
  }, [placement]);
  // Bridges the kernel's "did a touch just happen?" out to the JSX-wired show below,
  // so the emulated mouse a tap fires can't flash the tip. Set once the effect binds.
  const recentTouchRef = useRef<() => boolean>(() => false);

  const showNow = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos(tipPosFor(r, placementRef.current));
  };
  // Pointer/keyboard entry. Skipped for a beat after any touch so the synthesized
  // mouseenter (and the focus a tap hands a button) can't flash the tip; a genuine
  // hover or keyboard focus, with no recent touch, shows it exactly as before.
  const show = () => {
    if (recentTouchRef.current()) return;
    showNow();
  };
  const hide = () => setPos(null);

  // Bind the long-press kernel to the trigger the consumer already refs. pointer is
  // left false: the consumer wires mouse/focus itself (above), so only touch + the
  // click-suppression are added here.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { cleanup, recentTouch } = bindTouchTip(el, showNow, hide);
    recentTouchRef.current = recentTouch;
    return cleanup;
    // Mount-once: bind to the trigger a single time. showNow/hide close only over
    // stable refs + setPos, so the first-render copies behave identically forever.
  }, []);

  return { ref, pos, show, hide };
}
