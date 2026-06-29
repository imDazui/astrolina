// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The movable "Local Space" window (View ▸ Local Space): directional lines radiating
// from an origin point, each pointing to a planet's compass bearing in the local sky.
// The window being open IS the on switch — opening it draws the lines, closing hides
// them — so there's no separate show/hide toggle inside.
export const localSpaceHud = {
  title: 'Local Space',
  closeAria: 'Close Local Space',
  closeHint: 'Turn off the local-space view.',
  lsOrigin: {
    pin: 'From the pin',
    pinHint:
      'Relocated local space: the lines radiate from the active pin (the birthplace when nothing is pinned).',
    birthplace: 'From the birthplace',
    birthplaceHint:
      'The lines stay anchored to the birthplace even while a pin is down.',
  },
  hideInbound: {
    title: 'Hide inbound lines',
    hint: 'Drop the half of each local-space line pointing away from the planet (toward its antipode), leaving only the bearing toward it.',
  },
  hideCompass: {
    title: 'Hide compass',
    hint: 'Hide the local-horizon compass wheel that fades in at the origin once you zoom in.',
  },
  flyToOrigin: {
    title: 'Fly to origin',
    hint: 'Drop into the local horizon: fly the camera to the origin the lines radiate from.',
  },
} as const;
