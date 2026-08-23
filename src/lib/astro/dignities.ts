// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Element/modality tallies and essential dignities — pure sign-table lookups
// over longitudes the chart already has.
//
// The two schools disagree about exactly three signs — Scorpio, Aquarius and
// Pisces — and the disagreement is not cosmetic: it moves the DETRIMENTS too.
// Traditional Mars rules Scorpio, so traditional Mars is in detriment in Taurus
// as well as Libra; modern Mars rules Aries alone and Taurus costs it nothing,
// the detriment there belonging to Pluto instead. So the scheme is a parameter
// rather than a merged table, and `both` — the default, and what every install
// had before this was a choice — is the union of the two, which is why a
// rulership or detriment only ONE school grants is named as its school's when
// the reader has asked for both (see `from` below). Exaltations are the seven
// classical ones under every scheme; the moderns assign the outer planets none.
import type { PlanetName } from '../ephemeris';

export type Element = 'fire' | 'earth' | 'air' | 'water';
export type Modality = 'cardinal' | 'fixed' | 'mutable';
export type Dignity = 'rulership' | 'exaltation' | 'detriment' | 'fall';
export type RulershipScheme = 'traditional' | 'modern' | 'both';

const ELEMENTS: Element[] = ['fire', 'earth', 'air', 'water'];
const MODALITIES: Modality[] = ['cardinal', 'fixed', 'mutable'];

/** 0-based sign index (0 = Aries) of an ecliptic longitude in radians. */
export function signIndex(lonRad: number): number {
  const deg = (((lonRad * 180) / Math.PI) % 360 + 360) % 360;
  return Math.floor(deg / 30);
}

export const signElement = (signIdx: number): Element => ELEMENTS[signIdx % 4];
export const signModality = (signIdx: number): Modality => MODALITIES[signIdx % 3];

// Sign indices ruled by each planet in the traditional seven-planet scheme: the
// luminaries take one sign each, the other five take two, and the outer three
// rule nothing at all — so under this scheme they drop out of a dignity read
// entirely rather than appearing without one.
const TRADITIONAL_RULERSHIP: Partial<Record<PlanetName, number[]>> = {
  Sun: [4], // Leo
  Moon: [3], // Cancer
  Mercury: [2, 5], // Gemini, Virgo
  Venus: [1, 6], // Taurus, Libra
  Mars: [0, 7], // Aries, Scorpio
  Jupiter: [8, 11], // Sagittarius, Pisces
  Saturn: [9, 10], // Capricorn, Aquarius
};

// …and in the modern scheme, where the outer three take over the second home of
// Mars, Jupiter and Saturn — each of those keeping only its day house.
const MODERN_RULERSHIP: Partial<Record<PlanetName, number[]>> = {
  Sun: [4], // Leo
  Moon: [3], // Cancer
  Mercury: [2, 5], // Gemini, Virgo
  Venus: [1, 6], // Taurus, Libra
  Mars: [0], // Aries — Scorpio goes to Pluto
  Jupiter: [8], // Sagittarius — Pisces goes to Neptune
  Saturn: [9], // Capricorn — Aquarius goes to Uranus
  Uranus: [10], // Aquarius
  Neptune: [11], // Pisces
  Pluto: [7], // Scorpio
};

// The classical exaltation degrees' signs.
const EXALTATION: Partial<Record<PlanetName, number>> = {
  Sun: 0, // Aries
  Moon: 1, // Taurus
  Mercury: 5, // Virgo
  Venus: 11, // Pisces
  Mars: 9, // Capricorn
  Jupiter: 3, // Cancer
  Saturn: 6, // Libra
};

const opposite = (signIdx: number) => (signIdx + 6) % 12;

export interface DignityResult {
  dignity: Dignity;
  /** Which school granted a rulership or detriment the two DISAGREE about, for
   *  labelling under `both` — without it Mars and Pluto both read "rulership" in
   *  Scorpio with nothing to tell them apart. Null wherever the schools agree
   *  (naming one would imply a choice that wasn't made), under a single-school
   *  scheme (nothing to disambiguate), and for exaltation/fall (always classical). */
  from: 'traditional' | 'modern' | null;
}

/** Names the school only when `both` is asked for AND exactly one school claims
 *  the sign — the two conditions under which the label carries information. */
function attribute(
  scheme: RulershipScheme,
  byTraditional: boolean,
  byModern: boolean,
): DignityResult['from'] {
  if (scheme !== 'both' || (byTraditional && byModern)) return null;
  return byTraditional ? 'traditional' : 'modern';
}

/** The planet's essential dignity in a sign, or null when it has none there. */
export function essentialDignity(
  planet: PlanetName,
  signIdx: number,
  scheme: RulershipScheme = 'both',
): DignityResult | null {
  // Each school's rulerships, emptied when the reader has excluded that school.
  const trad = scheme === 'modern' ? [] : (TRADITIONAL_RULERSHIP[planet] ?? []);
  const modern = scheme === 'traditional' ? [] : (MODERN_RULERSHIP[planet] ?? []);

  const ruledTrad = trad.includes(signIdx);
  const ruledModern = modern.includes(signIdx);
  if (ruledTrad || ruledModern) {
    return { dignity: 'rulership', from: attribute(scheme, ruledTrad, ruledModern) };
  }

  const exalted = EXALTATION[planet];
  if (exalted === signIdx) return { dignity: 'exaltation', from: null };

  // Detriment follows each school's own rulerships, so the schools disagree here
  // for the same three signs' opposites — Taurus, Leo and Virgo.
  const detTrad = trad.some((s) => opposite(s) === signIdx);
  const detModern = modern.some((s) => opposite(s) === signIdx);
  if (detTrad || detModern) {
    return { dignity: 'detriment', from: attribute(scheme, detTrad, detModern) };
  }

  if (exalted !== undefined && opposite(exalted) === signIdx) {
    return { dignity: 'fall', from: null };
  }
  return null;
}
