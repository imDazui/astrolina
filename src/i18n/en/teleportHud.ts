// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The movable "Teleport" window (View ▸ Teleport): fly the map camera to any city,
// region or country without panning, then jump back. Camera-only — it doesn't move
// the pin/chart. Place names and coordinates stay language-neutral.
export const teleportHud = {
  title: 'Teleport',
  // Drag/recentre hint reuses the shared common.hud strings.
  closeAria: 'Close Teleport',
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
} as const;
