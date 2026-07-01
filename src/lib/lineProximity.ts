// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Point ↔ map-line proximity, entirely client-side over the already-generated line
// geometry. Distances are exact point-to-great-circle-segment arcs in 3D vector form —
// trig on unit vectors is insensitive to the ±180° unwrapping the rendered lines carry,
// so there is no longitude-normalization step (or want for one). This is the shared
// kernel behind: the "spotlight" reveal in App (filterWithinKm — which features to draw),
// the per-location "lines near here" list a HUD can present (linesNearPoint), and the
// place↔line search (citiesNearLine, which lives with the city index).

import type { Feature, FeatureCollection, LineString } from 'geojson';

const R_KM = 6371;
const D2R = Math.PI / 180;

export type Vec3 = [number, number, number];

export const toVec = (lat: number, lng: number): Vec3 => {
  const phi = lat * D2R;
  const lam = lng * D2R;
  return [Math.cos(phi) * Math.cos(lam), Math.cos(phi) * Math.sin(lam), Math.sin(phi)];
};

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

// Great-circle distance between unit vectors. atan2 keeps full precision at small
// separations, where the dot product alone saturates toward 1.
export const vecDistKm = (a: Vec3, b: Vec3) => Math.atan2(len(cross(a, b)), dot(a, b)) * R_KM;

// Min distance from point P to the great-circle ARC a→b (all unit vectors). Cross-track
// distance when P's foot lies within the arc, else the nearer endpoint. The two sign tests
// check the foot sits forward of `a` and behind `b` along the arc's travel direction
// (n = a×b is the circle's pole).
export function pointSegmentKm(p: Vec3, a: Vec3, b: Vec3): number {
  const n = cross(a, b);
  const nl = len(n);
  if (nl < 1e-12) return vecDistKm(p, a); // degenerate: a ≈ b
  const nu: Vec3 = [n[0] / nl, n[1] / nl, n[2] / nl];
  const t = dot(p, nu); // sin(cross-track angle), signed
  // Foot of P on the circle: remove the off-plane component and renormalize.
  const f: Vec3 = [p[0] - t * nu[0], p[1] - t * nu[1], p[2] - t * nu[2]];
  const fl = len(f);
  if (fl < 1e-9) {
    // P sits at the circle's pole — every circle point is 90° away.
    return Math.min((Math.PI / 2) * R_KM, vecDistKm(p, a), vecDistKm(p, b));
  }
  const fu: Vec3 = [f[0] / fl, f[1] / fl, f[2] / fl];
  if (dot(cross(a, fu), n) >= 0 && dot(cross(fu, b), n) >= 0) {
    return Math.asin(Math.min(1, Math.abs(t))) * R_KM;
  }
  return Math.min(vecDistKm(p, a), vecDistKm(p, b));
}

// GeoJSON positions are [lng, lat].
export type Coords = [number, number][];

/** Split one or more polylines into consecutive [a, b] great-circle segment pairs. */
export function toSegments(coordsList: Coords[]): [Vec3, Vec3][] {
  const segs: [Vec3, Vec3][] = [];
  for (const coords of coordsList) {
    let prev: Vec3 | null = null;
    for (const [lng, lat] of coords) {
      const v = toVec(lat, lng);
      if (prev) segs.push([prev, v]);
      prev = v;
    }
  }
  return segs;
}

/** Closest great-circle approach (km) from (lat,lng) to a line, whose geometry may be split
 *  across several pieces — pass every piece. Infinity for an empty/degenerate geometry. */
export function nearestApproachKm(lat: number, lng: number, coordsList: Coords[]): number {
  const p = toVec(lat, lng);
  let best = Infinity;
  for (const [a, b] of toSegments(coordsList)) {
    const d = pointSegmentKm(p, a, b);
    if (d < best) best = d;
  }
  return best;
}

/** True if any part of the line passes within `maxKm` of (lat,lng). Early-exits on the first
 *  qualifying segment, so it's cheaper than nearestApproachKm when you only need the boolean. */
export function isWithinKm(coordsList: Coords[], lat: number, lng: number, maxKm: number): boolean {
  const p = toVec(lat, lng);
  for (const [a, b] of toSegments(coordsList)) {
    if (pointSegmentKm(p, a, b) <= maxKm) return true;
  }
  return false;
}

/** A new FeatureCollection keeping only the LineString features that pass within `maxKm` of
 *  (lat,lng). Per-FEATURE: a normal one-feature line (its whole great circle) reveals whole;
 *  a line split into several features reveals only the pieces that qualify. */
export function filterWithinKm<P>(
  fc: FeatureCollection<LineString, P>,
  lat: number,
  lng: number,
  maxKm: number,
): FeatureCollection<LineString, P> {
  const features = fc.features.filter((f: Feature<LineString, P>) =>
    isWithinKm([f.geometry.coordinates as Coords], lat, lng, maxKm),
  );
  return { ...fc, features };
}

export interface LineEntry {
  /** Caller's identity for the line — carried through to the result. */
  key: string;
  coordsList: Coords[];
}

export interface LineNearPoint {
  key: string;
  km: number;
}

/**
 * Every entry whose line passes within `maxKm` of (lat, lng), nearest first. Brute force over
 * all segments — the visible line set is a few thousand segments at most, well under a
 * millisecond of vector math.
 */
export function linesNearPoint(
  entries: LineEntry[],
  lat: number,
  lng: number,
  maxKm: number,
): LineNearPoint[] {
  const p = toVec(lat, lng);
  const out: LineNearPoint[] = [];
  for (const e of entries) {
    let best = Infinity;
    for (const [a, b] of toSegments(e.coordsList)) {
      const d = pointSegmentKm(p, a, b);
      if (d < best) best = d;
    }
    if (best <= maxKm) out.push({ key: e.key, km: best });
  }
  return out.sort((x, y) => x.km - y.km);
}
