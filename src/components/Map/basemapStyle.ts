// Post-load adjustments to the remote vector basemap: a "plain" recolor for the
// vintage theme (flat brown earth + blue water) and global road / river layer
// visibility toggles. We mutate the already-loaded style's layers rather than
// shipping custom style JSON, so it tracks whatever OpenFreeMap serves.
import type { Map as MlMap, LayerSpecification } from 'maplibre-gl';
import type { Theme } from '../../lib/theme';

const ROAD_RE = /(highway|motorway|trunk|primary|secondary|street|road|transport|bridge|tunnel)/i;
const RIVER_RE = /(waterway|river|stream|canal)/i;

// Vintage "old map" palette: parchment-brown land, muted blue water.
const VINTAGE = {
  earth: '#cdbb95',
  water: '#90b4cf',
  road: '#9c7b4f',
  boundary: '#a8895f',
  label: '#5a4528',
  halo: '#e7d9ba',
};

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    /* layer may not support the property; ignore */
  }
}

function sourceLayer(l: LayerSpecification): string {
  return (l as { 'source-layer'?: string })['source-layer'] ?? '';
}

function isRoadLayer(l: LayerSpecification): boolean {
  const sl = sourceLayer(l);
  return (
    sl === 'transportation' ||
    sl === 'transportation_name' ||
    ROAD_RE.test(l.id)
  );
}

function isRiverLayer(l: LayerSpecification): boolean {
  const sl = sourceLayer(l);
  return sl === 'waterway' || RIVER_RE.test(l.id);
}

function isWaterFill(l: LayerSpecification): boolean {
  return sourceLayer(l) === 'water' || /water|ocean|sea/i.test(l.id);
}

export interface DetailToggles {
  showRoads: boolean;
  showRivers: boolean;
}

// Show/hide road and river layers across any theme. Rivers are checked first so
// a waterway never gets swept up by the broader road match. Applied last (after
// any recolor) so the toggles always win.
export function applyDetailToggles(map: MlMap, t: DetailToggles): void {
  for (const l of map.getStyle().layers ?? []) {
    if (isRiverLayer(l)) {
      safe(() =>
        map.setLayoutProperty(l.id, 'visibility', t.showRivers ? 'visible' : 'none'),
      );
    } else if (isRoadLayer(l)) {
      safe(() =>
        map.setLayoutProperty(l.id, 'visibility', t.showRoads ? 'visible' : 'none'),
      );
    }
  }
}

// Flatten the vintage basemap: brown background, blue water, everything else
// (landcover, landuse, buildings, etc.) hidden so the map reads as a plain
// parchment chart. Boundaries and labels are kept but recolored.
function plainifyVintage(map: MlMap): void {
  for (const l of map.getStyle().layers ?? []) {
    const sl = sourceLayer(l);
    switch (l.type) {
      case 'background':
        safe(() => map.setPaintProperty(l.id, 'background-color', VINTAGE.earth));
        break;
      case 'fill':
        if (isWaterFill(l)) {
          safe(() => map.setPaintProperty(l.id, 'fill-color', VINTAGE.water));
          safe(() => map.setPaintProperty(l.id, 'fill-opacity', 1));
        } else {
          safe(() => map.setLayoutProperty(l.id, 'visibility', 'none'));
        }
        break;
      case 'fill-extrusion':
        safe(() => map.setLayoutProperty(l.id, 'visibility', 'none'));
        break;
      case 'line':
        if (isRiverLayer(l)) {
          safe(() => map.setPaintProperty(l.id, 'line-color', VINTAGE.water));
        } else if (isRoadLayer(l)) {
          safe(() => map.setPaintProperty(l.id, 'line-color', VINTAGE.road));
        } else if (sl === 'boundary' || /boundary|admin/i.test(l.id)) {
          safe(() => map.setPaintProperty(l.id, 'line-color', VINTAGE.boundary));
        } else {
          safe(() => map.setLayoutProperty(l.id, 'visibility', 'none'));
        }
        break;
      case 'symbol':
        safe(() => map.setPaintProperty(l.id, 'text-color', VINTAGE.label));
        safe(() => map.setPaintProperty(l.id, 'text-halo-color', VINTAGE.halo));
        break;
    }
  }
}

// Full pass after a (re)style: recolor for the theme, then apply the toggles.
export function applyBasemapStyle(
  map: MlMap,
  theme: Theme,
  toggles: DetailToggles,
): void {
  if (theme === 'vintage') plainifyVintage(map);
  applyDetailToggles(map, toggles);
}
