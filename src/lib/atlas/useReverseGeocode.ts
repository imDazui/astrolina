import { useEffect, useState } from 'react';
import { reverseGeocode } from './geocode';

interface Pt {
  lat: number;
  lng: number;
}

// Snap to ~110 m so jittery hover collapses to one lookup + cache entry.
const cellKey = (lat: number, lng: number) =>
  `${lat.toFixed(3)},${lng.toFixed(3)}`;

// Module-level cache: persists across renders and component instances so a cell
// is reverse-geocoded at most once per session (the edge function also caches
// across sessions). Stores null for points with no addressable place.
const cache = new Map<string, string | null>();

/**
 * Reverse-geocode the active map point (pin or hover) to a "City, Region,
 * Country" label. Hover fires per pixel and unthrottled, so the lookup is
 * debounced (~400 ms) and abortable, and results are cached per ~110 m cell
 * (known cells resolve instantly). The label is kept sticky while the cursor is
 * moving, updating once it settles, so the readout doesn't flicker. Returns
 * null when there is no active point.
 *
 * Every setLabel runs inside the timer/promise callback (never synchronously in
 * the effect body) so it doesn't cascade renders on each hover tick.
 */
export function useReverseGeocode(point: Pt | null): string | null {
  const [label, setLabel] = useState<string | null>(null);
  const key = point ? cellKey(point.lat, point.lng) : null;

  useEffect(() => {
    if (!key || !point) {
      // No active point — clear once the cursor has actually left (deferred so
      // it isn't a synchronous effect setState, and cancelled on quick re-entry).
      const t = setTimeout(() => setLabel(null), 0);
      return () => clearTimeout(t);
    }
    const cached = cache.has(key);
    const ctrl = new AbortController();
    const timer = setTimeout(
      () => {
        if (cached) {
          setLabel(cache.get(key) ?? null);
          return;
        }
        reverseGeocode(point.lat, point.lng, ctrl.signal)
          .then((name) => {
            cache.set(key, name);
            if (!ctrl.signal.aborted) setLabel(name);
          })
          .catch(() => {
            /* aborted or network error — keep the last (sticky) label */
          });
      },
      cached ? 0 : 400,
    );
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [key, point]);

  return label;
}
