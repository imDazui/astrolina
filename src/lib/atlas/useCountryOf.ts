// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useMemo, useState } from 'react';

type CountryOf = (lat: number, lng: number) => string | null;

/**
 * Resolve a map point to its country name entirely OFFLINE — the hover
 * readout's fallback when no city is in range (open country, coasts). Mirrors
 * useNearestCityLabel: the world-atlas polygon chunk (~100 KB) dynamic-imports
 * on first use instead of riding the startup bundle, and the point-in-polygon
 * lookup memoizes on the point. Returns null until the chunk has loaded or
 * when the point hits no country (open ocean).
 */
export function useCountryOf(
  point: { lat: number; lng: number } | null,
): string | null {
  const [countryOf, setCountryOf] = useState<CountryOf | null>(null);
  const active = point !== null;

  useEffect(() => {
    if (!active || countryOf) return;
    let cancelled = false;
    import('./countryOf').then((m) => {
      if (!cancelled) setCountryOf(() => m.countryOf);
    });
    return () => {
      cancelled = true;
    };
  }, [active, countryOf]);

  return useMemo(
    () => (point && countryOf ? countryOf(point.lat, point.lng) : null),
    [point, countryOf],
  );
}
