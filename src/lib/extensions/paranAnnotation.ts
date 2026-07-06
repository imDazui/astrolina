// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// PARAN-annotation slot — a single-slot seam (like skyBandTrack / captureSink)
// letting a downstream build append one computed line of text to a paran's
// hover tip, for the POSITION being hovered along the latitude line. The map
// calls the registered provider with the paran's own feature properties (which
// carry the pairing's shared sidereal time, ParanProps.theta) plus the cursor's
// coordinate, and renders whatever plain-text string comes back as a `.ui-tip-sub`
// line under the pairing's name — re-queried as the cursor slides along the
// line. No registration → the tip is unchanged. The provider does its own
// gating (return null to stay silent), the same contract as CaptureSink.isActive:
// core never asks why.
import type { ParanProps } from '../astro/parans';

/** Extra tip line for a paran at a position along it: plain text, or null for
 *  no annotation. Called per processed hover frame — keep it cheap. */
export type ParanAnnotation = (
  props: ParanProps,
  at: { lat: number; lng: number },
) => string | null;

let annotation: ParanAnnotation | null = null;

/** Register the paran annotation (downstream builds only; call once at startup). */
export function setParanAnnotation(fn: ParanAnnotation): void {
  annotation = fn;
}

/** The registered annotation provider, or null (the open core registers none). */
export function getParanAnnotation(): ParanAnnotation | null {
  return annotation;
}
