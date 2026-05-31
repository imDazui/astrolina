# Bundled font

The astrological glyphs (planets, zodiac signs, Black Moon Lilith, lunar nodes)
are drawn with a **subset of Noto Sans Symbols** — pinned to Regular (400) and
reduced to only the codepoints the app renders (see `scripts/subset-font.sh`).
The subset `.woff2` lives in `src/fonts/` and is inlined into the built
stylesheet, so there is no separate font file at runtime; this directory ships
the font's license alongside the deployed site at `/fonts/OFL.txt`.

## Source & license

- **Font:** Noto Sans Symbols — <https://github.com/notofonts/symbols>
- **Copyright:** Copyright 2022 The Noto Project Authors
- **License:** SIL Open Font License, Version 1.1 — full text in
  [`OFL.txt`](./OFL.txt) (and at <https://openfontlicense.org>)

The subset is a "Modified Version" under the OFL. This is permitted: it stays
under the OFL only, and the copyright notice + license travel with the
distribution (this folder / `OFL.txt`, which `vite build` copies verbatim into
`dist/fonts/`). The Noto Sans Symbols copyright declares **no Reserved Font
Name**, so the subset keeps the original `Noto Sans Symbols` family name.
