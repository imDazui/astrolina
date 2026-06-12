// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Node stand-in for '@swisseph/browser', used only by the verify-script harness
// (scripts/harness/run.mjs). The verify scripts exercise the REAL src/lib
// modules — not hand-mirrored copies of their math — so the harness bundles
// them with this module aliased in place of the browser package. Both packages
// wrap the same Swiss Ephemeris C library and share one type surface
// (@swisseph/core); this file adapts the node package's flat functions to the
// browser package's class shape and points Swiss at the repo's own .se1 files.
// The smoke script (smoke.ts) asserts enum parity between the two packages
// rather than assuming it.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Runtime require keeps @swisseph/node out of the esbuild bundle — its native
// binding can't be inlined — and sidesteps ESM/CJS named-export interop.
const requireCjs = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const swe: any = requireCjs('@swisseph/node');

export const Planet = swe.Planet;
export const LunarPoint = swe.LunarPoint;
export const Asteroid = swe.Asteroid;
export const HouseSystem = swe.HouseSystem;
export const CalculationFlag = swe.CalculationFlag;
export const CalendarType = swe.CalendarType;
export const EclipseType = swe.EclipseType;

// Verify scripts run via `npm run verify:*`, which executes from the repo root.
const EPHE_DIR = resolve(process.cwd(), 'public/ephe');

export class SwissEphemeris {
  // The browser build streams .se1 files into a WASM virtual filesystem; here
  // they already sit on disk, so init just points Swiss at the directory. The
  // wasm path argument the app passes is meaningless under Node and ignored.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async init(_wasmPath?: string): Promise<void> {
    if (!existsSync(resolve(EPHE_DIR, 'sepl_18.se1'))) {
      throw new Error(
        `Swiss .se1 data not found under ${EPHE_DIR} — run harness scripts from the repo root.`,
      );
    }
    swe.setEphemerisPath(EPHE_DIR);
  }

  // The app "loads" files by fetching them into the virtual FS; on disk we only
  // need to confirm they exist, so a missing file fails as loudly as a 404 would.
  async loadEphemerisFiles(files: Array<{ name: string; url: string }>): Promise<void> {
    for (const f of files) {
      if (!existsSync(resolve(EPHE_DIR, f.name))) {
        throw new Error(`Missing ephemeris file: ${resolve(EPHE_DIR, f.name)}`);
      }
    }
  }

  julianDay(
    year: number,
    month: number,
    day: number,
    hour?: number,
    calendarType?: number,
  ): number {
    return swe.julianDay(year, month, day, hour, calendarType);
  }

  julianDayToDate(jd: number, calendarType?: number): unknown {
    return swe.julianDayToDate(jd, calendarType);
  }

  calculatePosition(julianDay: number, body: number, flags?: number): unknown {
    return swe.calculatePosition(julianDay, body, flags);
  }

  calculateHouses(
    julianDay: number,
    latitude: number,
    longitude: number,
    houseSystem?: string,
  ): unknown {
    return swe.calculateHouses(julianDay, latitude, longitude, houseSystem);
  }

  findNextSolarEclipse(
    startJulianDay: number,
    flags?: number,
    eclipseType?: number,
    backward?: boolean,
  ): unknown {
    return swe.findNextSolarEclipse(startJulianDay, flags, eclipseType, backward);
  }

  findNextLunarEclipse(
    startJulianDay: number,
    flags?: number,
    eclipseType?: number,
    backward?: boolean,
  ): unknown {
    return swe.findNextLunarEclipse(startJulianDay, flags, eclipseType, backward);
  }
}
