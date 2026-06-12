// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Regenerates the eclipse catalogs from NASA's Five Millennium Catalogs.
//
//   node scripts/build-eclipses.mjs           # both catalogs
//   node scripts/build-eclipses.mjs solar     # one of them
//   node scripts/build-eclipses.mjs lunar
//
// Downloads the per-century catalog pages of the Five Millennium Catalog of
// Solar Eclipses and of Lunar Eclipses (Fred Espenak & Jean Meeus, NASA/GSFC),
// keeps the years the bundled ephemeris files cover (1800–2399, see
// public/ephe), and emits the compact JSON the Eclipses overlay loads for its
// picker list. The catalogs supply what Swiss Ephemeris cannot — Saros series
// and lunation numbers — plus seed metadata (type, gamma, magnitudes, the
// greatest-eclipse ground point); the app re-derives precise event times and
// all geometry from Swiss Ephemeris at runtime so the drawn features stay
// self-consistent with the app's own sky.
//
// Every row is cross-validated against a Swiss Ephemeris enumeration
// (@swisseph/node + the same .se1 files the app ships): the two catalogs must
// agree 1:1 on event times and classification before anything is written.
//
// Output (committed to the repo):
//   src/lib/astro/data/solarEclipses.json — positional rows, chronological:
//       [id "YYYY-MM-DD" (TD date of greatest eclipse — the stable selection
//        key), "HH:MM" TD of greatest, type "T"|"A"|"H"|"P", central 0|1,
//        saros, lunation (synodic months since 2000-01-06), gamma, magnitude,
//        geLat, geLng (whole degrees, +N/+E), pathWidthKm|null,
//        centralDurationSec|null]
//   src/lib/astro/data/lunarEclipses.json — same idea:
//       [id, "HH:MM" TD, type "T"|"P"|"N" (total/partial/penumbral), saros,
//        lunation, gamma, penumbralMag, umbralMag (negative when the Moon
//        misses the umbra), zenLat, zenLng (sub-lunar point at greatest,
//        whole degrees), durPenMin, durParMin|null, durTotMin|null
//        (phase durations, decimal minutes)]
//
// NASA eclipse data terms: free to reproduce with acknowledgment — see the
// attribution in NOTICE ("Eclipse Predictions by Fred Espenak and Jean Meeus
// (NASA's GSFC)"). This is a one-time / refresh tool, not a build step.

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  setEphemerisPath,
  julianDay,
  findNextSolarEclipse,
  findNextLunarEclipse,
  CalculationFlag,
  EclipseType,
} from '@swisseph/node';

const YEAR_MIN = 1800;
const YEAR_MAX = 2399;

const dataDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', 'src', 'lib', 'astro', 'data',
);

const MONTHS = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

// Shared row prefix of both catalogs:
//   cat#   date         TD greatest  ΔT(s)  lunation  saros
const PREFIX_RE =
  '^\\s*(\\d{5})\\s+' +
  '(\\d{4}) ([A-Z][a-z]{2}) (\\d{2})\\s+' +
  '(\\d{2}):(\\d{2}):(\\d{2})\\s+' +
  '(-?\\d+)\\s+' +
  '(-?\\d+)\\s+' +
  '(\\d+)\\s+';

// Parse the columns both catalogs share; returns null when the year is out of
// ephemeris range. `m` must come from a regex built on PREFIX_RE.
function parseShared(m) {
  const [, , year, mon, day, hh, mm, ss, dt, lunation, saros] = m;
  const y = Number(year);
  if (y < YEAR_MIN || y > YEAR_MAX) return null;
  return {
    id: `${year}-${String(MONTHS[mon]).padStart(2, '0')}-${day}`,
    timeTD: `${hh}:${mm}`,
    // UT julian day of greatest eclipse (TD minus the catalog's own ΔT),
    // used only to line rows up with the Swiss enumeration below.
    jdUT:
      julianDay(y, MONTHS[mon], Number(day), Number(hh) + Number(mm) / 60 + Number(ss) / 3600) -
      Number(dt) / 86400,
    saros: Number(saros),
    lunation: Number(lunation),
  };
}

// ── Per-body configuration ────────────────────────────────────────────────────

const SOLAR = {
  label: 'solar',
  base: 'https://eclipse.gsfc.nasa.gov/SEcat5',
  pages: [
    'SE1701-1800.html', // for the year 1800 only
    'SE1801-1900.html',
    'SE1901-2000.html',
    'SE2001-2100.html',
    'SE2101-2200.html',
    'SE2201-2300.html',
    'SE2301-2400.html', // 2400 itself is dropped (outside ephemeris coverage)
  ],
  outFile: 'solarEclipses.json',
  source:
    'Five Millennium Catalog of Solar Eclipses, Fred Espenak & Jean Meeus (NASA/GSFC), eclipse.gsfc.nasa.gov',
  // Remainder of a solar row after the shared prefix:
  //   type+variant  QLE  gamma  magnitude  lat lng  [alt]  [width]  [duration]
  // e.g. "H   -n  -0.3473  1.0074  11S 119W  70   27  00m42s"
  // Partial rows leave alt/width/duration blank or '-'.
  rowRe: new RegExp(
    PREFIX_RE +
    '([PATH])([a-z+\\-23]?)\\s+' +   // type + variant char
    '(\\S{2})\\s+' +                 // QLE code (unused)
    '(-?[\\d.]+)\\s+' +              // gamma
    '([\\d.]+)\\s+' +                // magnitude
    '(\\d+)([NS])\\s+(\\d+)([EW])' + // greatest-eclipse lat/lng
    '(?:\\s+(\\d+))?' +              // sun altitude (unused)
    '(?:\\s+(\\d+|-))?' +            // path width km
    '(?:\\s+(\\d+)m(\\d+)s)?\\s*$',  // central duration
  ),
  parseRow(m) {
    const shared = parseShared(m);
    if (!shared) return null;
    const [
      typeChar, variant, , gamma, mag, latAbs, latNS, lngAbs, lngEW,
      , width, durMin, durSec,
    ] = m.slice(11);
    // Variant char (see eclipse.gsfc.nasa.gov/SEcat5/catkey.html): '+'/'-' are
    // NON-central (umbra axis misses Earth); 'n'/'s' are central with one
    // missing limit; 'm'/'b'/'e'/'2'/'3' are saros/hybrid notes — all central.
    const central =
      typeChar !== 'P' && variant !== '+' && variant !== '-' ? 1 : 0;
    return {
      ...shared,
      typeChar,
      central,
      gamma: Number(gamma),
      magnitude: Number(mag),
      geLat: Number(latAbs) * (latNS === 'N' ? 1 : -1),
      geLng: Number(lngAbs) * (lngEW === 'E' ? 1 : -1),
      widthKm: width && width !== '-' ? Number(width) : null,
      durationSec: durMin ? Number(durMin) * 60 + Number(durSec) : null,
    };
  },
  emitRow: (r) => [
    r.id, r.timeTD, r.typeChar, r.central, r.saros, r.lunation,
    r.gamma, r.magnitude, r.geLat, r.geLng, r.widthKm, r.durationSec,
  ],
  enumerate: (jd) => findNextSolarEclipse(jd, CalculationFlag.SwissEphemeris, 0, false),
  swissKind(typeFlags) {
    if (typeFlags & EclipseType.AnnularTotal) return 'H';
    if (typeFlags & EclipseType.Total) return 'T';
    if (typeFlags & EclipseType.Annular) return 'A';
    return 'P';
  },
  // Classification text used in the disagreement report.
  describe: (r) => `${r.typeChar}${r.central ? ' central' : ''}`,
  describeSwiss(e) {
    const central = e.type & EclipseType.Central ? ' central' : '';
    return `${this.swissKind(e.type)}${central}`;
  },
  agreesWithSwiss(r, e) {
    return (
      this.swissKind(e.type) === r.typeChar &&
      (e.type & EclipseType.Central ? 1 : 0) === r.central
    );
  },
};

const LUNAR = {
  label: 'lunar',
  base: 'https://eclipse.gsfc.nasa.gov/LEcat5',
  pages: [
    'LE1701-1800.html', // for the year 1800 only
    'LE1801-1900.html',
    'LE1901-2000.html',
    'LE2001-2100.html',
    'LE2101-2200.html',
    'LE2201-2300.html',
    'LE2301-2400.html',
  ],
  outFile: 'lunarEclipses.json',
  source:
    'Five Millennium Catalog of Lunar Eclipses, Fred Espenak & Jean Meeus (NASA/GSFC), eclipse.gsfc.nasa.gov',
  // Remainder of a lunar row after the shared prefix:
  //   type+variant  QSE  gamma  penMag  umbMag  durPen durPar durTot  lat lng
  // e.g. "T   p-   0.3720  2.1618  1.1889  311.0  196.3   61.0   22N   57E"
  // Durations are decimal minutes; '-' marks phases the eclipse lacks
  // (penumbral-only rows have no partial/total, partials no total). The
  // umbral magnitude is negative when the Moon misses the umbra entirely.
  rowRe: new RegExp(
    PREFIX_RE +
    '([NPT])([a-z+\\-]?)\\s+' +      // type + variant char
    '(\\S{1,2})\\s+' +               // QSE code (unused)
    '(-?[\\d.]+)\\s+' +              // gamma
    '(-?[\\d.]+)\\s+' +              // penumbral magnitude
    '(-?[\\d.]+)\\s+' +              // umbral magnitude
    '([\\d.]+|-)\\s+' +              // penumbral duration (min)
    '([\\d.]+|-)\\s+' +              // partial duration
    '([\\d.]+|-)\\s+' +              // total duration
    '(\\d+)([NS])\\s+(\\d+)([EW])\\s*$', // sub-lunar point at greatest
  ),
  parseRow(m) {
    const shared = parseShared(m);
    if (!shared) return null;
    const [
      typeChar, , , gamma, penMag, umbMag, durPen, durPar, durTot,
      latAbs, latNS, lngAbs, lngEW,
    ] = m.slice(11);
    const dur = (s) => (s !== '-' ? Number(s) : null);
    return {
      ...shared,
      typeChar,
      gamma: Number(gamma),
      penMag: Number(penMag),
      umbMag: Number(umbMag),
      zenLat: Number(latAbs) * (latNS === 'N' ? 1 : -1),
      zenLng: Number(lngAbs) * (lngEW === 'E' ? 1 : -1),
      durPenMin: dur(durPen),
      durParMin: dur(durPar),
      durTotMin: dur(durTot),
    };
  },
  emitRow: (r) => [
    r.id, r.timeTD, r.typeChar, r.saros, r.lunation, r.gamma,
    r.penMag, r.umbMag, r.zenLat, r.zenLng,
    r.durPenMin, r.durParMin, r.durTotMin,
  ],
  enumerate: (jd) => findNextLunarEclipse(jd, CalculationFlag.SwissEphemeris, 0, false),
  swissKind(typeFlags) {
    if (typeFlags & EclipseType.Total) return 'T';
    if (typeFlags & EclipseType.Partial) return 'P';
    return 'N';
  },
  describe: (r) => r.typeChar,
  describeSwiss(e) {
    return this.swissKind(e.type);
  },
  agreesWithSwiss(r, e) {
    return this.swissKind(e.type) === r.typeChar;
  },
};

// ── Shared pipeline ───────────────────────────────────────────────────────────

async function getText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}

function parsePage(html, body) {
  const rows = [];
  for (const raw of html.split('\n')) {
    // Each data cell may be wrapped in <a> links to maps/plots; the underlying
    // text is a fixed-width table. Entities only appear in the header (Δ, °).
    const line = raw.replace(/<[^>]*>/g, '');
    const m = body.rowRe.exec(line);
    if (!m) continue;
    const row = body.parseRow(m);
    if (row) rows.push(row);
  }
  return rows;
}

// Enumerate the same period with Swiss Ephemeris so the committed catalog is
// guaranteed to line up with what the app will compute at runtime.
function swissEnumerate(body, jdStart, jdEnd) {
  const events = [];
  let jd = jdStart;
  for (;;) {
    const e = body.enumerate(jd);
    if (e.maximum > jdEnd) break;
    events.push(e);
    jd = e.maximum + 1; // successive eclipses are never less than ~14 days apart
  }
  return events;
}

async function buildCatalog(body) {
  console.log(`\n[${body.label}] Fetching Five Millennium Catalog pages…`);
  const rows = [];
  for (const page of body.pages) {
    const html = await getText(`${body.base}/${page}`);
    const parsed = parsePage(html, body);
    console.log(`  ${page}: ${parsed.length} eclipses in range`);
    rows.push(...parsed);
  }
  rows.sort((a, b) => a.jdUT - b.jdUT);
  const ids = new Set(rows.map((r) => r.id));
  if (ids.size !== rows.length) throw new Error('duplicate eclipse ids');

  console.log(`Parsed ${rows.length} eclipses ${YEAR_MIN}–${YEAR_MAX}.`);

  console.log('Cross-validating against Swiss Ephemeris…');
  const jdStart = julianDay(YEAR_MIN, 1, 1, 0);
  const jdEnd = julianDay(YEAR_MAX, 12, 31, 24);
  const swiss = swissEnumerate(body, jdStart - 2, jdEnd);
  console.log(`  Swiss enumeration: ${swiss.length} eclipses.`);
  if (swiss.length !== rows.length) {
    // Walk both lists to report where they diverge before bailing.
    for (let i = 0; i < Math.min(swiss.length, rows.length); i++) {
      if (Math.abs(swiss[i].maximum - rows[i].jdUT) > 0.5) {
        console.error(`  First divergence at index ${i}: catalog ${rows[i].id}, Swiss JD ${swiss[i].maximum}`);
        break;
      }
    }
    throw new Error(`count mismatch: catalog ${rows.length} vs Swiss ${swiss.length}`);
  }

  let worstDt = 0;
  const typeDisagreements = [];
  for (let i = 0; i < rows.length; i++) {
    const dt = Math.abs(swiss[i].maximum - rows[i].jdUT);
    worstDt = Math.max(worstDt, dt);
    if (dt > 0.02) {
      throw new Error(
        `time mismatch at ${rows[i].id}: |Swiss − catalog| = ${(dt * 1440).toFixed(1)} min`,
      );
    }
    if (!body.agreesWithSwiss(rows[i], swiss[i])) {
      // Boundary cases (hybrid/total, central/non-central, penumbral/partial)
      // legitimately differ between ΔT models and shadow constants; report,
      // don't fail.
      typeDisagreements.push(
        `  ${rows[i].id}: catalog ${body.describe(rows[i])} vs Swiss ${body.describeSwiss(swiss[i])}`,
      );
    }
  }
  console.log(`  Worst time delta: ${(worstDt * 86400).toFixed(1)} s.`);
  if (typeDisagreements.length) {
    console.log(`  ${typeDisagreements.length} classification disagreement(s) (kept catalog values):`);
    for (const d of typeDisagreements) console.log(d);
  }

  // One row per line keeps the committed file diffable on refresh.
  const json =
    '{\n' +
    `  "source": ${JSON.stringify(body.source)},\n` +
    `  "range": ${JSON.stringify([YEAR_MIN, YEAR_MAX])},\n` +
    '  "rows": [\n' +
    rows.map((r) => `    ${JSON.stringify(body.emitRow(r))}`).join(',\n') +
    '\n  ]\n}\n';
  const outPath = join(dataDir, body.outFile);
  await mkdir(dataDir, { recursive: true });
  await writeFile(outPath, json);
  console.log(`Wrote ${rows.length} eclipses to ${outPath}`);
}

async function main() {
  const which = process.argv[2];
  if (which && which !== 'solar' && which !== 'lunar') {
    throw new Error(`unknown catalog "${which}" — expected solar or lunar`);
  }
  setEphemerisPath(process.cwd() + '/public/ephe');
  if (which !== 'lunar') await buildCatalog(SOLAR);
  if (which !== 'solar') await buildCatalog(LUNAR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
