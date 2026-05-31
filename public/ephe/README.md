# Swiss Ephemeris data files

These are Swiss Ephemeris compressed ephemeris files (`.se1`), loaded at startup
into the WebAssembly engine (`@swisseph/browser`) and used as the single source
of truth for all astronomical calculations in the app.

| File          | Contents                                   | Coverage      |
| ------------- | ------------------------------------------ | ------------- |
| `sepl_18.se1` | Planets (Sun–Pluto)                        | 1800–2399 AD  |
| `semo_18.se1` | Moon                                        | 1800–2399 AD  |
| `seas_18.se1` | Main-belt asteroids incl. Chiron, Ceres, Pallas, Juno, Vesta | 1800–2399 AD |

To support birth/transit dates outside 1800–2399, add the adjacent files
(e.g. `*_12.se1` for 1200–1799, `*_24.se1` for 2400–2999) here and list them in
`EPHE_FILES` in `src/lib/ephemeris.ts`.

## Source & license

Downloaded from the official Astrodienst repository:
<https://github.com/aloistr/swisseph/tree/master/ephe>

Swiss Ephemeris is dual-licensed; this project uses it (and redistributes these
data files) under the **GNU Affero General Public License v3.0 (AGPL-3.0)**, the
same license as the rest of this repository. See
<https://www.astro.com/swisseph/> for details.
