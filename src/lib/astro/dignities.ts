// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Element/modality tallies and essential dignities — pure sign-table lookups
// over longitudes the chart already has.
//
// THE MODERN SCHEME ADDS; IT DOES NOT REPLACE. Pluto is the modern ruler of
// Scorpio, Uranus of Aquarius, Neptune of Pisces — and Mars, Saturn and Jupiter
// keep those signs alongside them. Both rulers of a sign are read, and both are
// in detriment in the sign opposite: Mars AND Pluto in Taurus, Saturn AND Uranus
// in Leo, Jupiter AND Neptune in Virgo.
//
// That is why there are two schemes and not three, and why the choice never moves
// a classical planet's dignity. `traditional` is the seven-planet table alone;
// `modern` is that same table plus the outer three. Switching to Traditional only
// ever REMOVES the outer planets' rows — nothing else in the list changes.
//
// Some popular texts do treat Modern as a REPLACEMENT — Mars losing Scorpio, and
// with it its Taurus detriment. That is not the reading here, and modelling it that
// way makes the setting appear to move detriments around, which it never does.
//
// Exaltations are the seven classical ones under both schemes; the moderns assign
// the outer planets none, so those three can hold rulership and detriment but
// never exaltation or fall.
import type { PlanetName } from '../ephemeris';

export type Element = 'fire' | 'earth' | 'air' | 'water';
export type Modality = 'cardinal' | 'fixed' | 'mutable';
export type Dignity = 'rulership' | 'exaltation' | 'detriment' | 'fall';
export type RulershipScheme = 'traditional' | 'modern';

const ELEMENTS: Element[] = ['fire', 'earth', 'air', 'water'];
const MODALITIES: Modality[] = ['cardinal', 'fixed', 'mutable'];

/** 0-based sign index (0 = Aries) of an ecliptic longitude in radians. */
export function signIndex(lonRad: number): number {
  const deg = (((lonRad * 180) / Math.PI) % 360 + 360) % 360;
  return Math.floor(deg / 30);
}

export const signElement = (signIdx: number): Element => ELEMENTS[signIdx % 4];
export const signModality = (signIdx: number): Modality => MODALITIES[signIdx % 3];

// The seven-planet table — read under BOTH schemes. The luminaries take one sign
// each, the other five take two, and none of this is touched by the setting.
const CLASSICAL_RULERSHIP: Partial<Record<PlanetName, number[]>> = {
  Sun: [4], // Leo
  Moon: [3], // Cancer
  Mercury: [2, 5], // Gemini, Virgo
  Venus: [1, 6], // Taurus, Libra
  Mars: [0, 7], // Aries, Scorpio
  Jupiter: [8, 11], // Sagittarius, Pisces
  Saturn: [9, 10], // Capricorn, Aquarius
};

// The modern additions — read only under `modern`, and the ONLY thing the scheme
// switches. Each takes a second, later claim on a sign the table above already
// assigns; neither claim cancels the other.
const OUTER_RULERSHIP: Partial<Record<PlanetName, number[]>> = {
  Uranus: [10], // Aquarius, beside Saturn
  Neptune: [11], // Pisces, beside Jupiter
  Pluto: [7], // Scorpio, beside Mars
};

// The three signs with a ruler from each era — derived rather than written out, so
// it cannot drift from the tables it describes. {Scorpio, Aquarius, Pisces}.
const CLASSICAL_SIGNS = new Set(Object.values(CLASSICAL_RULERSHIP).flat());
const SHARED_SIGNS = new Set(
  Object.values(OUTER_RULERSHIP)
    .flat()
    .filter((s) => CLASSICAL_SIGNS.has(s)),
);

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

const isOuter = (planet: PlanetName) => planet in OUTER_RULERSHIP;

/** The signs a planet rules under a scheme. A planet appears in exactly one of the
 *  two tables, so there is nothing to merge — only the outer three to withhold. */
function ruledSigns(planet: PlanetName, scheme: RulershipScheme): number[] {
  if (isOuter(planet)) return scheme === 'modern' ? (OUTER_RULERSHIP[planet] ?? []) : [];
  return CLASSICAL_RULERSHIP[planet] ?? [];
}

export interface DignityResult {
  dignity: Dignity;
  /** Which era's rulership this row rests on, for the three signs that have one from
   *  each — otherwise Mars and Pluto both read a bare "rulership" in Scorpio with
   *  nothing to tell them apart, which is the confusion the reading has to answer.
   *  Null everywhere else: under `traditional` (no modern claim exists to confuse it
   *  with), on a sign only one era rules, and for exaltation/fall, which are classical
   *  under both schemes. */
  from: 'traditional' | 'modern' | null;
}

/** Names the era only where the sign genuinely has one ruler from each — for a
 *  detriment that is the sign OPPOSITE, the one actually ruled. (Venus is in
 *  detriment in Scorpio because it rules Taurus, which no outer planet claims, so
 *  that row stays unlabelled even though Scorpio itself is shared.) */
function attribute(
  planet: PlanetName,
  ruledSign: number,
  scheme: RulershipScheme,
): DignityResult['from'] {
  if (scheme !== 'modern' || !SHARED_SIGNS.has(ruledSign)) return null;
  return isOuter(planet) ? 'modern' : 'traditional';
}

/** The planet's essential dignity in a sign, or null when it has none there. */
export function essentialDignity(
  planet: PlanetName,
  signIdx: number,
  scheme: RulershipScheme = 'modern',
): DignityResult | null {
  const ruled = ruledSigns(planet, scheme);

  if (ruled.includes(signIdx)) {
    return { dignity: 'rulership', from: attribute(planet, signIdx, scheme) };
  }

  const exalted = EXALTATION[planet];
  if (exalted === signIdx) return { dignity: 'exaltation', from: null };

  // Detriment is the sign opposite one the planet rules — so it follows the same
  // table, and a modern ruler is in detriment opposite its sign exactly as the
  // classical ruler of that sign is.
  const detrimentFrom = ruled.find((s) => opposite(s) === signIdx);
  if (detrimentFrom !== undefined) {
    return { dignity: 'detriment', from: attribute(planet, detrimentFrom, scheme) };
  }

  if (exalted !== undefined && opposite(exalted) === signIdx) {
    return { dignity: 'fall', from: null };
  }
  return null;
}
