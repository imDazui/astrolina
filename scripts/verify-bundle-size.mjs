// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Report the wire size of everything a deployed session can download — every
// asset in dist/, which includes the runtime-fetched Swiss Ephemeris files
// copied from public/ephe/. Prints raw, gzip and brotli sizes — the host
// (Cloudflare Pages) serves brotli, so that column is the one that matters
// when judging a size optimisation. Run after a build:
//
//   npm run build && node scripts/verify-bundle-size.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

const root = process.cwd();

// Files below this raw size are noise in the report (icons, manifests).
const MIN_REPORT_BYTES = 10 * 1024;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

const rows = [];
{
  let files;
  try {
    files = [...walk(join(root, 'dist'))];
  } catch {
    console.error('dist/ not found — run `npm run build` first');
    process.exit(1);
  }
  for (const path of files) {
    const buf = readFileSync(path);
    if (buf.length < MIN_REPORT_BYTES) continue;
    // Quality 11 is what CDNs serve for static assets; the default (4) would
    // understate the savings this report exists to measure.
    const brotli = brotliCompressSync(buf, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    });
    rows.push({
      file: relative(root, path).replaceAll('\\', '/'),
      raw: buf.length,
      gzip: gzipSync(buf, { level: 9 }).length,
      brotli: brotli.length,
    });
  }
}

rows.sort((a, b) => b.brotli - a.brotli);
const width = Math.max(...rows.map((r) => r.file.length));
console.log(
  `${'file'.padEnd(width)}  ${'raw'.padStart(10)}  ${'gzip'.padStart(10)}  ${'brotli'.padStart(10)}`,
);
for (const r of rows) {
  console.log(
    `${r.file.padEnd(width)}  ${kb(r.raw).padStart(10)}  ${kb(r.gzip).padStart(10)}  ${kb(r.brotli).padStart(10)}`,
  );
}
const total = (k) => rows.reduce((sum, r) => sum + r[k], 0);
console.log(
  `${'TOTAL'.padEnd(width)}  ${kb(total('raw')).padStart(10)}  ${kb(total('gzip')).padStart(10)}  ${kb(total('brotli')).padStart(10)}`,
);
