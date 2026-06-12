// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Builds src/lib/atlas/data/lmtEras.json from the IANA tz database source: for
// every zone, the moment its LOCAL MEAN TIME era ended (the UNTIL field of the
// Zone block's LMT line(s)), plus the Link alias map.
//
// Why the app needs this: before a region adopted standard time, the tz
// database carries the local mean time of the zone's REFERENCE CITY (e.g.
// Europe/Berlin = Berlin's +0:53:28) as a stand-in for the whole zone. A birth
// chart cast for any other town in that era should use the mean time of the
// BIRTHPLACE itself — the convention of the astrological atlases (astro.com,
// ACS) — which timezone.ts derives from the birth longitude once it knows the
// birth predates the zone's standardization moment recorded here. The boundary
// matters and cannot be inferred from offset values at runtime: France kept
// Paris Mean Time (same value as Paris LMT, +0:09:21) as its LEGAL time from
// 1891 to 1911, and legal mean-time standards must NOT be replaced.
//
// Two subtleties (June 2026 audit findings):
//   - A zone block may carry TWO consecutive LMT lines when the territory
//     crossed the date line (Alaska 1867, the Philippines 1845, Samoa 1892,
//     Guam 1845, Rarotonga 1900...): same local meridian, calendar reckoning
//     shifted by ~24 h. The LMT era then extends to the SECOND line's UNTIL.
//     We extend exactly when the offset jump exceeds 12 h (a reckoning shift);
//     smaller jumps (Lisbon Δ0, Lima Δ24s, São Tomé Δ1h04) are legal mean-time
//     standards that must end the era at the FIRST UNTIL, like Paris.
//   - The UNTIL time-of-day is kept: US zones standardized at local NOON on
//     1883-11-18 (the "Day of Two Noons"), so that morning is still LMT.
//
// Source: the tzdb development repository (public domain), same data that
// ships in ICU/browsers. Usage: node scripts/build-lmt-table.mjs
import { writeFileSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/eggert/tz/main';
const REGION_FILES = [
  'africa',
  'antarctica',
  'asia',
  'australasia',
  'europe',
  'northamerica',
  'southamerica',
  'backward', // Link lines (legacy aliases → canonical names)
];

const MONTHS = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

// "0:53:28" / "-9:59:36" → signed hours.
function offsetHours(s) {
  const m = s.match(/^(-?)(\d+)(?::(\d+))?(?::(\d+))?$/);
  if (!m) return null;
  const v = Number(m[2]) + Number(m[3] ?? 0) / 60 + Number(m[4] ?? 0) / 3600;
  return m[1] === '-' ? -v : v;
}

// UNTIL tokens → "YYYY-MM-DDTHH:MM:SS" wall clock (in the LMT era the wall
// clock is the reference city's mean time). A `u`/`g`/`z` suffix marks the time
// as Universal Time — modern tzdb writes the US 1883 "Day of Two Noons" as
// `17:00u`, i.e. noon-ish local — so those convert via the line's own offset;
// `s` (standard) equals the LMT offset during an LMT era, and the default is
// already wall clock.
function parseUntil(name, until, stdoffHours) {
  const year = Number(until[0]);
  const month = until[1] ? MONTHS[until[1]] : 1;
  let day = 1;
  if (until[2]) {
    if (/^\d+$/.test(until[2])) day = Number(until[2]);
    else console.warn(`  ${name}: non-numeric UNTIL day "${until[2]}" — using 1`);
  }
  let hh = 0;
  let mm = 0;
  let ss = 0;
  let suffix = '';
  if (until[3]) {
    const t = until[3].match(/^(\d+):(\d+)(?::(\d+))?([wsugz]?)$/);
    if (t) {
      hh = Number(t[1]);
      mm = Number(t[2]);
      ss = Number(t[3] ?? 0);
      suffix = t[4] ?? '';
    } else {
      console.warn(`  ${name}: unparsed UNTIL time "${until[3]}" — using 00:00`);
    }
  }
  if (!Number.isFinite(year) || !month) return null;
  let ms = Date.UTC(year, month - 1, day, hh, mm, ss);
  if ((suffix === 'u' || suffix === 'g' || suffix === 'z') && stdoffHours !== null) {
    ms += stdoffHours * 3600_000; // UT → the era's wall clock
  }
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  );
}

const ends = {};
const links = {};
let version = 'unknown';

// The development repo's NEWS file leads with the latest release name.
const newsRes = await fetch(`${BASE}/NEWS`);
if (newsRes.ok) {
  const m = (await newsRes.text()).match(/Release (\S+)/);
  if (m) version = m[1];
}

for (const file of REGION_FILES) {
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`fetch ${file}: HTTP ${res.status}`);
  const text = await res.text();

  // Zone whose LMT era may continue onto the next line, with its last offset.
  let open = null; // { name, stdoff }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    if (!line) continue;
    const tok = line.split(/\s+/).filter(Boolean);

    if (tok[0] === 'Link' && tok.length >= 3) {
      links[tok[2]] = tok[1];
      open = null;
      continue;
    }
    if (tok[0] === 'Rule') {
      open = null;
      continue;
    }

    if (tok[0] === 'Zone') {
      // Zone <name> <stdoff> <rules> <format> [until...]
      const [, name, stdoff, , format, ...until] = tok;
      open = null;
      if (format !== 'LMT') continue; // e.g. Antarctica's "-00" uninhabited starts
      if (until.length === 0) {
        console.warn(`  ${name}: LMT with no UNTIL — skipped`);
        continue;
      }
      const end = parseUntil(name, until, offsetHours(stdoff));
      if (!end) {
        console.warn(`  ${name}: unparsed UNTIL "${until.join(' ')}" — skipped`);
        continue;
      }
      ends[name] = end;
      open = { name, stdoff: offsetHours(stdoff) };
      continue;
    }

    // Continuation line of an open Zone block: <stdoff> <rules> <format> [until...]
    if (open && /^\s/.test(rawLine)) {
      const [stdoff, , format, ...until] = tok;
      const off = offsetHours(stdoff);
      if (
        format === 'LMT' &&
        off !== null &&
        open.stdoff !== null &&
        Math.abs(off - open.stdoff) > 12 && // date-line reckoning shift, not a legal standard
        until.length > 0
      ) {
        const end = parseUntil(open.name, until, off);
        if (end) {
          ends[open.name] = end;
          open = { name: open.name, stdoff: off };
          continue;
        }
      }
      open = null;
      continue;
    }
    open = null;
  }
}

const out = { version, ends, links };
const path = new URL('../src/lib/atlas/data/lmtEras.json', import.meta.url);
writeFileSync(path, JSON.stringify(out, null, 1) + '\n');
console.log(
  `lmtEras.json written: tzdb ${version}, ${Object.keys(ends).length} zones, ${Object.keys(links).length} links`,
);
// Spot-check the boundary cases the audit cares about.
for (const z of [
  'Europe/Berlin', // 1893-04-01 (single LMT line)
  'Europe/Paris', // 1891-03-16 (PMT follows — must NOT extend)
  'America/New_York', // 1883-11-18T12:03:58 (Day of Two Noons — time kept)
  'Asia/Manila', // 1899-09-06 (second LMT line, date-line shift)
  'America/Anchorage', // 1900-08-20 (second LMT line)
  'Pacific/Rarotonga', // 1952-10-16 (second LMT line)
  'Europe/Lisbon', // 1884 (legal Lisbon MT follows — must NOT extend)
  'America/Lima', // 1890 (legal Lima MT follows — must NOT extend)
]) {
  console.log(`  ${z}: LMT until ${out.ends[z] ?? 'MISSING'}`);
}
