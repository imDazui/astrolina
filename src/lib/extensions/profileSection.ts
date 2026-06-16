// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Profile-section seam — lets a downstream build customize the top-left profile
// strip WITHOUT editing App.tsx: drop in an identity element (avatar, username,
// account controls) and/or override what the plan tag does when clicked. It is
// the single-slot twin of the menu registries in this folder. The open core
// installs nothing, so the strip shows just its plan tag and the tag auto-flips
// Advanced reading mode. A gated build calls registerProfileSection(...) at
// startup (before the first render) and the strip picks it up.

import type { ReactNode } from 'react';

/** Live Advanced state handed to a custom plan-tag handler, so it can flip the
 *  toggle, open a plan screen, or both. */
export interface PlanTagContext {
  advanced: boolean;
  setAdvanced: (v: boolean) => void;
}

/** Downstream customization of the profile strip. Every field is optional; the
 *  open core supplies none and falls back to its defaults (no identity element;
 *  the plan tag auto-flips Advanced). */
export interface ProfileSection {
  /** Identity element rendered at the strip's left — avatar, username, account
   *  controls. Absent in the open core (the strip shows just the plan tag). */
  renderIdentity?: () => ReactNode;
  /** Click behavior for the plan tag. The open core flips Advanced; a gated build
   *  may instead open a plan screen (and flip, or not, through the context). */
  onPlanTag?: (ctx: PlanTagContext) => void;
}

let section: ProfileSection = {};

/** Install the profile-section customization (downstream builds only). Last call wins. */
export function registerProfileSection(s: ProfileSection): void {
  section = s;
}

/** The installed customization, or an empty object in the open core. */
export function getProfileSection(): ProfileSection {
  return section;
}
