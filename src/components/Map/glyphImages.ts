// Rasterize the astrological PlanetGlyph SVGs into images MapLibre can embed
// inline in line labels (via the `['image', …]` format expression). We reuse the
// single glyph source of truth (PlanetGlyph) rather than re-drawing paths: render
// it to SVG markup, load it through an <img>, and snapshot to ImageData. Each
// planet is baked at its own color, keyed `glyph-<PlanetName>`.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Map as MlMap } from 'maplibre-gl';
import { PLANET_COLORS, PLANET_NAMES, type PlanetName } from '../../lib/ephemeris';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';

export const GLYPH_IMAGE_PREFIX = 'glyph-';

// Logical size of the inline glyph (px); RATIO renders it at 2× for crispness.
const LOGICAL = 15;
const RATIO = 2;
const PX = LOGICAL * RATIO;

function svgDataUrl(planet: PlanetName, color: string): string {
  let markup = renderToStaticMarkup(
    createElement(PlanetGlyph, { planet, size: PX, color }),
  );
  // An <img> can only load an SVG data URL if the root carries the SVG xmlns.
  if (!markup.includes('xmlns')) {
    markup = markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

function rasterize(planet: PlanetName, color: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image(PX, PX);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = PX;
      canvas.height = PX;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('no 2d context'));
        return;
      }
      ctx.drawImage(img, 0, 0, PX, PX);
      resolve(ctx.getImageData(0, 0, PX, PX));
    };
    img.onerror = reject;
    img.src = svgDataUrl(planet, color);
  });
}

// Add any missing planet-glyph images to the map. Idempotent, so it's safe to
// call again after a style reload (which clears images). Awaited before the
// custom layers are added so the `['image', …]` references resolve immediately.
export async function ensureGlyphImages(map: MlMap): Promise<void> {
  await Promise.all(
    PLANET_NAMES.map(async (p) => {
      const id = `${GLYPH_IMAGE_PREFIX}${p}`;
      if (map.hasImage(id)) return;
      try {
        const data = await rasterize(p, PLANET_COLORS[p]);
        if (!map.hasImage(id)) map.addImage(id, data, { pixelRatio: RATIO });
      } catch {
        /* leave missing; the label section just renders blank for this body */
      }
    }),
  );
}
