// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Relationship charts derived from two charts (the Synastry overlay's active chart +
// its partner). Davison is a real moment + place, so it returns plain BirthData that
// casts like any natal chart; the caller stamps the StoredChart fields. (Composite
// Midpoints is not here yet — it has no real moment and needs precomputed positions
// threaded through the render stack.)
import type { BirthData } from '../birthData';
import { birthDataToJD, jdToCivil } from '../ephemeris';
import { NAME_HARD_LIMIT } from '../chartLibrary';

// Shorter-arc mean of two longitudes (degrees), normalized to [-180, 180). Averaging
// raw longitudes breaks when a pair straddles the ±180° meridian (e.g. +170 and −170
// would average to 0 instead of 180); going via the signed difference takes the nearer
// midpoint.
function midpointLng(a: number, b: number): number {
  const diff = ((b - a + 540) % 360) - 180; // b − a wrapped to (−180, 180]
  const mid = a + diff / 2;
  return (((mid % 360) + 540) % 360) - 180; // normalize to [−180, 180)
}

// Davison relationship chart: the arithmetic mean of the two births in Universal Time
// (one combined moment) at the geographic midpoint of the two birthplaces. The place
// has no city, so it is labelled "Space" with the real midpoint coordinates kept.
export function buildDavison(a: BirthData, b: BirthData): BirthData {
  const jdMid = (birthDataToJD(a) + birthDataToJD(b)) / 2;
  const { year, month, day, hour, minute } = jdToCivil(jdMid);
  return {
    name: `Davison: ${a.name} & ${b.name}`.slice(0, NAME_HARD_LIMIT),
    year,
    month,
    day,
    hour,
    minute,
    tzOffset: 0, // jdMid is already Universal Time
    birthplace: {
      label: 'Space',
      lat: (a.birthplace.lat + b.birthplace.lat) / 2,
      lng: midpointLng(a.birthplace.lng, b.birthplace.lng),
    },
  };
}
