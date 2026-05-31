#!/usr/bin/env bash
# Regenerate the astrological-glyph font subset from the full Noto Sans Symbols
# variable font. Run this after adding or removing a glyph in
# src/lib/astro/glyphChars.ts, then commit the updated .woff2.
#
# Prereq (one-time): python -m pip install fonttools brotli
#
# Output is woff2-only — woff2 is supported by ~98% of browsers, and anything
# older can't run this app's WebGL/WASM stack anyway.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="src/fonts/NotoSansSymbols-VariableFont_wght.ttf"
OUT="src/fonts/subset-NotoSansSymbols-Regular.woff2"

# Codepoints the app actually draws: PLANET_GLYPHS + the 12 SIGN_GLYPHS
# (U+2648–U+2653). Note: U+2609 (Sun ☉) and U+FE0E (text variation selector)
# are NOT in this font — the Sun falls back to the OS symbol font — so the
# subsetter silently ignores them; they're listed here for documentation.
UNICODES="2609,260A,260B,263D,263F,2640-2647,2648-2653,26B3-26B8,FE0E"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Pin the weight axis to Regular (400) so the subset is a small static font,
# then subset to woff2.
python -m fontTools.varLib.instancer "$SRC" wght=400 -o "$TMP/regular.ttf" >/dev/null
# --name-IDs='*' retains the 'name' table records — copyright (ID 0), license
# (ID 13), license URL (ID 14) — which fontTools drops by default when
# subsetting. This carries the OFL notice inside the woff2 binary too, per SIL
# OFL §2 / FAQ 2.4 (belt-and-suspenders with public/fonts/OFL.txt).
python -m fontTools.subset "$TMP/regular.ttf" \
  --unicodes="$UNICODES" \
  --name-IDs='*' \
  --flavor=woff2 \
  --output-file="$OUT"

echo "Wrote $OUT ($(wc -c < "$OUT") bytes)"
