// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The movable "Location" window (View ▸ Location): fly the map camera to any city,
// region or country, and control local space from the same place — where you're
// standing and what the sky looks like from there. Place names and coordinates stay
// language-neutral and are not in this catalog.
export const locationHud = {
  title: 'Location',
  // Drag/recentre hint reuses the shared common.hud strings (dragToMove + the
  // "Double 🖱" pill + recentreHint), so it matches the overlay HUDs' move hint.
  closeAria: 'Close Location',
  placeholder: 'Jump to a place…',
  searchAria: 'Search for a place to jump to',
  goForward: 'Return',
  goBack: 'Go back',
  // Result badge for each match's place kind (PlaceKind enum -> label).
  kind: {
    city: 'city',
    region: 'region',
    country: 'country',
  },
  // ── Local Space section ──────────────────────────────────────────────────────
  // Section heading + the local-space controls that used to live in Map Filters.
  localSpaceSection: 'Local Space',
  localSpace: {
    title: 'Show local space',
    hint: 'Directional lines radiating from the origin point, each pointing to a planet’s compass bearing in the local sky.',
  },
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
