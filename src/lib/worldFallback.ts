// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Coarse world outline (Natural Earth 1:110m countries, from the bundled `world-atlas` package — the
// SAME set the offline country lookup (countryOf) ships, so it adds no new download) as a GeoJSON
// FeatureCollection of continents + country borders. Used by the Map's OFFLINE basemap fallback
// (offlineStyle / installWorldFallback) when the live OpenFreeMap styles/tiles can't be reached.
//
// Map.tsx DYNAMIC-imports this, so it never rides the online path — online users don't download it.
// As a JS chunk it's covered by the service worker's precache, so it resolves with zero network.
import { feature } from 'topojson-client';
import topo from 'world-atlas/countries-110m.json';

let cached: GeoJSON.FeatureCollection | null = null;

/** The countries-110m polygons (continents + borders) as GeoJSON, decoded once and cached. */
export function worldOutline(): GeoJSON.FeatureCollection {
  if (!cached) {
    cached = feature(
      topo,
      (topo as { objects: { countries: unknown } }).objects.countries,
    ) as unknown as GeoJSON.FeatureCollection;
  }
  return cached;
}
