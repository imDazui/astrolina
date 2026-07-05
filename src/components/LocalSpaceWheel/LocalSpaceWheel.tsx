// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useState } from 'react';
import './LocalSpaceWheel.css';
import {
  WheelTip,
  planetMeaning,
  relaxRing,
  type Aspect,
  type AspectCategory,
  type HoverTip,
} from '../Wheel/WheelSvg';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import {
  PLANET_COLORS,
  type EclipticPosition,
  type PlanetName,
} from '../../lib/ephemeris';
import { useT } from '../../i18n';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const CARDINALS: { az: number; letter: string }[] = [
  { az: 0, letter: 'N' },
  { az: 90, letter: 'E' },
  { az: 180, letter: 'S' },
  { az: 270, letter: 'W' },
];
const TICKS = Array.from({ length: 24 }, (_, i) => i); // notches every 15°

interface LocalSpaceWheelProps {
  size: number;
  /** Bodies to plot (order + names; positions come from `coords`). */
  planets: EclipticPosition[];
  /** Per-body azimuth/altitude in degrees; az clockwise from north. Bodies
   *  without an entry are skipped. */
  coords: ReadonlyMap<PlanetName, { az: number; alt: number }>;
  /** Azimuth aspects to chord inside the dial (lonA/lonB carry az radians). */
  aspects?: Aspect[];
  visibleAspects?: Set<AspectCategory>;
}

// Horizon-frame dial for the wheel sidebar: bodies plotted by their compass
// bearing (azimuth) at the local-space origin — the same bearings the lines
// radiate along on the map. A compass, not a zodiac: no signs, houses, or cusp
// values, just N/E/S/W and a tick ring. North up, east right, like the map's
// horizon compass (LocalHorizonWheel), whose rim this dial mirrors. The planet
// marks are the zodiac wheel's own (wheel-svg classes + WheelTip), so discs,
// hover lift, and the named hover tag read identically on both wheels.
export function LocalSpaceWheel({
  size,
  planets,
  coords,
  aspects,
  visibleAspects,
}: LocalSpaceWheelProps) {
  const { t, labels } = useT();
  const [tip, setTip] = useState<HoverTip | null>(null);
  const clearTip = () => setTip(null);

  const c = size / 2;
  const R = size / 2 - 18; // tick-ring radius; cardinals sit outside it
  // az measured clockwise from north, north up: x grows with sin, y shrinks
  // with cos (SVG y runs downward).
  const azPos = (azDeg: number, r: number) => ({
    x: c + r * Math.sin(azDeg * DEG2RAD),
    y: c - r * Math.cos(azDeg * DEG2RAD),
  });

  const shown = planets.filter((p) => coords.has(p.name));

  // Spread colliding glyphs along the ring (same separation target as the
  // zodiac wheel); a bold rim tick still marks each body's true azimuth.
  const rPlanets = (R * 38) / 45 - 14;
  const arr = shown.map((p) => ({
    name: p.name,
    off: coords.get(p.name)!.az,
  }));
  arr.sort((a, b) => a.off - b.off);
  const sep = Math.min(
    20,
    Math.max(4, (16 * 360) / (2 * Math.PI * Math.max(rPlanets, 1))),
  );
  relaxRing(arr, sep);
  const displayAz = new Map(arr.map((e) => [e.name, e.off]));

  const rChord = rPlanets - 14;
  const chords = (aspects ?? []).filter(
    (a) =>
      a.type !== 'conjunction' && // visually coincident endpoints
      (visibleAspects?.has(a.category) ?? true),
  );

  const svg = (
    <svg
      // wheel-svg + interactive borrow the zodiac wheel's planet-mark styling
      // (disc fill, hit target, hover lift) so the marks match exactly.
      className="local-space-wheel wheel-svg interactive"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      <circle cx={c} cy={c} r={R} className="lsw-ring" />
      <circle cx={c} cy={c} r={(R * 30) / 45} className="lsw-ring-inner" />
      {TICKS.map((i) => {
        const az = i * 15;
        const card = i % 6 === 0;
        const half = i % 2 === 0;
        const r1 = card ? (R * 38) / 45 : half ? (R * 41) / 45 : (R * 43) / 45;
        const p1 = azPos(az, r1);
        const p2 = azPos(az, R);
        return (
          <line
            key={i}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            className={card ? 'lsw-tick-major' : 'lsw-tick'}
          />
        );
      })}
      <line
        x1={c}
        y1={c - (R * 43) / 45}
        x2={c}
        y2={c + (R * 43) / 45}
        className="lsw-axis"
      />
      <line
        x1={c - (R * 43) / 45}
        y1={c}
        x2={c + (R * 43) / 45}
        y2={c}
        className="lsw-axis"
      />
      <circle cx={c} cy={c} r={2} className="lsw-center" />

      {CARDINALS.map(({ az, letter }) => {
        const pos = azPos(az, R + 11);
        return (
          <text
            key={letter}
            x={pos.x}
            y={pos.y}
            className="lsw-card"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {letter}
          </text>
        );
      })}

      {chords.map((a, i) => {
        const p1 = azPos(a.lonA * RAD2DEG, rChord);
        const p2 = azPos(a.lonB * RAD2DEG, rChord);
        return (
          <line
            key={`chord-${i}`}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={a.color}
            strokeWidth={1}
            opacity={0.7}
          />
        );
      })}

      {shown.map((p) => {
        const { az, alt } = coords.get(p.name)!;
        const below = alt < 0;
        const tickOut = azPos(az, R - 1);
        const tickIn = azPos(az, R - 7);
        const pos = azPos(displayAz.get(p.name)!, rPlanets);
        const r = 11; // the detailed zodiac wheel's disc radius
        return (
          // The zodiac wheel's planet mark verbatim: transparent hit disc, hover
          // lift on the visual group, and the shared named tag on hover. Bodies
          // below the horizon keep the mark but dim (lsw-below).
          <g
            key={p.name}
            className={below ? 'planet-mark lsw-below' : 'planet-mark'}
            onMouseEnter={() =>
              setTip({
                x: pos.x,
                y: pos.y,
                r,
                title: labels.planet(p.name),
                sub: planetMeaning(t, p.name),
                color: PLANET_COLORS[p.name],
                marker: (
                  <PlanetGlyph
                    planet={p.name}
                    size={14}
                    color={PLANET_COLORS[p.name]}
                  />
                ),
              })
            }
            onMouseLeave={clearTip}
            aria-label={labels.planet(p.name)}
          >
            <line
              x1={tickIn.x}
              y1={tickIn.y}
              x2={tickOut.x}
              y2={tickOut.y}
              stroke={PLANET_COLORS[p.name]}
              strokeWidth={1.5}
            />
            <line
              x1={tickIn.x}
              y1={tickIn.y}
              x2={pos.x}
              y2={pos.y}
              stroke={PLANET_COLORS[p.name]}
              strokeWidth={0.6}
              opacity={0.4}
            />
            <circle cx={pos.x} cy={pos.y} r={r + 6} className="planet-hit" />
            <g className="planet-mark-visual">
              <circle
                cx={pos.x}
                cy={pos.y}
                r={r}
                className="planet-disc-fill"
                stroke={PLANET_COLORS[p.name]}
                strokeWidth={1.3}
              />
              <PlanetGlyph
                planet={p.name}
                x={pos.x}
                y={pos.y}
                size={16}
                color={PLANET_COLORS[p.name]}
              />
            </g>
          </g>
        );
      })}
    </svg>
  );

  // Same wrap as the zodiac wheel: the hint tag is an absolutely-positioned
  // HTML sibling over the SVG (user units map 1:1 to px).
  return (
    <div className="wheel-svg-wrap">
      {svg}
      {tip && <WheelTip tip={tip} size={size} />}
    </div>
  );
}
