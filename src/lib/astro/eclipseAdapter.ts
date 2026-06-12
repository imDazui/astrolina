// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The thin boundary between the always-loaded ephemeris engine and the
// eclipse-geometry module: the sample/event shapes both sides speak, plus the
// normalizer for @swisseph's misaligned eclipse-search result. It lives apart
// from eclipsePath.ts ON PURPOSE — ephemeris.ts (in the entry bundle) needs
// only this slice, while the Besselian fitting in eclipsePath rides the lazy
// eclipses chunk; importing it from eclipsePath would drag all of that code
// back into the main bundle.

// ── Ephemeris adapter ─────────────────────────────────────────────────────────

/** Apparent geocentric Sun + Moon at one UT instant, equinox of date. */
export interface SunMoonSample {
  sunRa: number;     // radians
  sunDec: number;
  sunDistAu: number; // AU
  moonRa: number;
  moonDec: number;
  moonDistAu: number;
  gast: number;      // Greenwich apparent sidereal time, radians
}

export interface EclipseEphemeris {
  sunMoon(jdUT: number): SunMoonSample;
}

/** The slice of a Swiss eclipse-search result the geometry needs (UT JDs). */
export interface EclipseEventTimes {
  maximum: number;
  /** First/last external penumbral contact (P1/P4) — the global eclipse window. */
  partialBegin: number;
  partialEnd: number;
}

/**
 * Correct @swisseph's SolarEclipse field misalignment. The wrapper names its
 * fields as if the C library's tret[] array started with the phase contacts,
 * but tret[1] is actually "eclipse at local apparent noon", so every named
 * field is one slot off (verified against NASA's published contact times for
 * 2024-04-08): `partialEnd` holds P1, `centralBegin` holds P4, and the true
 * center-line end (tret[7]) is not exposed at all. We take only the fields
 * with reliable meanings; the axis-on-Earth window is re-derived from our own
 * elements in computeElements, which the lost tret slots would have fed.
 */
export function normalizeSwissEclipse(raw: {
  maximum: number;
  partialEnd: number;   // tret[2] — P1, partial begin
  centralBegin: number; // tret[3] — P4, partial end
}): EclipseEventTimes {
  const maximum = raw.maximum;
  let partialBegin = raw.partialEnd;
  let partialEnd = raw.centralBegin;
  // Extreme grazing eclipses (e.g. 1935-01-05, magnitude 0.0013 — the penumbra
  // barely kisses Earth) come back from Swiss with ZEROED contact slots, and
  // JD 0 would send the element sampler to 4713 BC, far outside the ephemeris
  // files. P1/P4 physically fall within ~3 h of maximum, so substitute a ±3 h
  // window when a slot is not a sane contact time; an over-wide window is
  // harmless downstream (off-Earth instants already trace as gaps).
  if (!(partialBegin > maximum - 1 && partialBegin < maximum)) {
    partialBegin = maximum - 3 / 24;
  }
  if (!(partialEnd > maximum && partialEnd < maximum + 1)) {
    partialEnd = maximum + 3 / 24;
  }
  return { maximum, partialBegin, partialEnd };
}
