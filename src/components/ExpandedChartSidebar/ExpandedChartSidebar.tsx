import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  PLANET_COLORS,
  PLANET_DISPLAY,
  type EclipticPosition,
  type HorizontalCoords,
  type PlanetName,
  type RelocatedAngles,
} from '../../lib/ephemeris';
import type { StoredChart } from '../../lib/chartLibrary';
import type { LineType } from '../../lib/astro/lines';
import { fmtLat, fmtLng } from '../../lib/coordFormat';
import { formatUtcOffset } from '../../lib/atlas/timezone';
import { ChartSwitcher } from '../ChartSwitcher/ChartSwitcher';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import { ZodiacGlyph } from '../ZodiacGlyph/ZodiacGlyph';
import {
  WheelSvg,
  computeAspects,
  computeCrossAspects,
  type AspectCategory,
} from '../Wheel/WheelSvg';
import { HoverTip, TipButton } from '../ui/HoverTip';
import { useHoverTip } from '../ui/useHoverTip';
import './ExpandedChartSidebar.css';

const SIGN_NAMES = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

// Astrology's conventional luminary-first ordering: Moon, Sun, then outward from
// the Sun (Mercury → Pluto), with the calculated points last. Drives the planet
// list's two-column flow (Moon/Sun, Mercury/Venus, Mars/Jupiter, …).
const PLANET_ORDER: PlanetName[] = [
  'Moon', 'Sun',
  'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto',
  'NorthNode', 'SouthNode', 'Lilith', 'Chiron', 'Ceres', 'Pallas', 'Juno', 'Vesta',
];
function planetRank(name: PlanetName): number {
  const i = PLANET_ORDER.indexOf(name);
  return i === -1 ? PLANET_ORDER.length : i;
}

// The Sun's maximum declination (Earth's obliquity, 23°26'). A body past this on
// either side is "out of bounds" — astrologically notable, so the readout flags
// it (pink past the limit, dark pink within).
const OOB_DEC_DEG = 23 + 26 / 60;
function decClass(decRad: number): string {
  return Math.abs((decRad * 180) / Math.PI) > OOB_DEC_DEG
    ? 'es-dec-oob'
    : 'es-dec-in';
}

const RAD2DEG = 180 / Math.PI;

// Degrees → "DD°MM'" (degrees + arcminutes), signed when asked. Used for every
// numeric column of the Advanced planet table (speed, latitude, RA, declination,
// azimuth, altitude). Azimuth/RA pass signed=false (they read 0–360).
function fmtDM(deg: number, signed = false): string {
  const sign = deg < 0 ? '-' : signed ? '+' : '';
  const abs = Math.abs(deg);
  let d = Math.floor(abs);
  let m = Math.round((abs - d) * 60);
  if (m === 60) { m = 0; d += 1; }
  return `${sign}${d}°${pad2(m)}'`;
}

// Longitude readout for the planet/angle rows: "23°17'" (with arc-seconds in
// Advanced) followed by the sign glyph and full sign name — e.g. 23°17' ♑ Capricorn.
function Longitude({ lon, advanced }: { lon: number; advanced: boolean }) {
  const lonDeg = ((lon * 180) / Math.PI + 360) % 360;
  const signIdx = Math.floor(lonDeg / 30);
  const inSign = lonDeg % 30;
  const d = Math.floor(inSign);
  const mFull = (inSign - d) * 60;
  const m = Math.floor(mFull);
  let dd = d;
  let mm = m;
  let ss = Math.round((mFull - m) * 60);
  if (ss === 60) { ss = 0; mm += 1; }
  if (mm === 60) { mm = 0; dd += 1; }
  const dms = advanced
    ? `${dd}°${pad2(mm)}'${pad2(ss)}"`
    : `${d}°${pad2(m)}'`;
  return (
    <>
      {dms}{' '}
      <span className="es-lon-sign">
        <ZodiacGlyph sign={signIdx} size={12} /> {SIGN_NAMES[signIdx]}
      </span>
    </>
  );
}

// Compact zodiacal longitude for the Advanced table's narrow column: degree,
// sign glyph, arcminute — e.g. 23°♑17' (the conventional "23 Cap 17" notation).
function SignLon({ lon }: { lon: number }) {
  const lonDeg = ((lon * 180) / Math.PI + 360) % 360;
  let signIdx = Math.floor(lonDeg / 30);
  const inSign = lonDeg % 30;
  let d = Math.floor(inSign);
  let m = Math.round((inSign - d) * 60);
  if (m === 60) { m = 0; d += 1; }
  if (d === 30) { d = 0; signIdx = (signIdx + 1) % 12; }
  return (
    <>
      {d}°<ZodiacGlyph sign={signIdx} size={11} />{pad2(m)}&#39;
    </>
  );
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmtChartDate(c: StoredChart): string {
  return `${c.day} ${MONTHS[c.month - 1]} ${c.year} · ${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
}

interface ExpandedChartSidebarProps {
  chart: StoredChart | null;
  charts: StoredChart[];
  point: { lat: number; lng: number } | null;
  pinned: boolean;
  isNatalPin: boolean;
  angles: RelocatedAngles | null;
  planets: EclipticPosition[];
  overlayPlanets?: EclipticPosition[] | null;
  overlayLabel?: string | null;
  /** Planets toggled on in the Map Filter; hidden ones are dropped everywhere. */
  visiblePlanets: Set<PlanetName>;
  /** Line-type toggles from the Map Filter; gate which angles show in the wheel + list. */
  visibleLineTypes: Set<LineType>;
  /** Per-body RA + azimuth/altitude for the Advanced table, keyed by planet. */
  advancedCoords: Map<PlanetName, HorizontalCoords>;
  onClose: () => void;
  /** Fired while the panel is being drag-resized, so the map can pause hover. */
  onResizingChange?: (resizing: boolean) => void;
  onSelectChart: (id: string) => void;
  onNewChart: () => void;
  onEditChart: (id: string) => void;
  onDeleteChart: (id: string) => void;
}

const WIDTH_KEY = 'astro:expanded-sidebar-width:v1';
const ASPECTS_KEY = 'astro:visible-aspects:v1';
const ADVANCED_KEY = 'astro:advanced:v1';
const DEFAULT_WIDTH = 720;
const MIN_WIDTH = 480;
// The drag handle won't take the panel past ~70% of the viewport (leaving the map
// usable), and never beyond 1200px — the chart wheel has stopped growing by then,
// so extra width just wastes space.
function maxSidebarWidth(): number {
  return Math.min(window.innerWidth * 0.7, 1200);
}

// Wheel sizing. The diameter fits the panel width, with MIN_WHEEL keeping it
// legible (never squished) even on narrow panels and MAX_WHEEL stopping it
// from ballooning on very wide ones.
const MIN_WHEEL = 280;
const MAX_WHEEL = 900;

const ASPECT_GLYPHS: Record<string, string> = {
  conjunction: '☌',
  opposition: '☍',
  trine: '△',
  square: '□',
  sextile: '⚹',
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Aspect orb as "0°12'" — seconds rarely meaningful for orbs.
function fmtOrb(orbDeg: number): string {
  const d = Math.floor(orbDeg);
  let m = Math.round((orbDeg - d) * 60);
  let dd = d;
  if (m === 60) { m = 0; dd += 1; }
  return `${dd}°${pad2(m)}'`;
}

const ASPECT_TOGGLES: {
  key: AspectCategory;
  label: string;
  cssClass: string;
  desc: string;
}[] = [
  { key: 'harmonious', label: 'Trine / Sextile', cssClass: 'trine', desc: 'Flowing, supportive aspects: ease, talent, and opportunity.' },
  { key: 'hard', label: 'Square / Opp', cssClass: 'square', desc: 'Tense aspects: friction, challenge, and the drive to grow.' },
  { key: 'conjunction', label: 'Conj', cssClass: 'conj', desc: 'Two bodies fused at the same point, blending their energies.' },
];

export function ExpandedChartSidebar({
  chart,
  charts,
  point,
  pinned,
  isNatalPin,
  angles,
  planets,
  overlayPlanets,
  overlayLabel,
  visiblePlanets,
  visibleLineTypes,
  advancedCoords,
  onClose,
  onResizingChange,
  onSelectChart,
  onNewChart,
  onEditChart,
  onDeleteChart,
}: ExpandedChartSidebarProps) {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    const base = saved && saved >= MIN_WIDTH ? saved : DEFAULT_WIDTH;
    // Rein in a width saved under the old (wider) cap, and fit a narrower viewport.
    return Math.max(MIN_WIDTH, Math.min(base, maxSidebarWidth()));
  });

  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(width));
  }, [width]);

  // Publish the live panel width so the map edge-glow insets its left edge to
  // the visible map area (right of this sidebar). Reset to 0 when collapsed.
  useEffect(() => {
    document.documentElement.style.setProperty('--es-width', `${width}px`);
    return () => {
      document.documentElement.style.setProperty('--es-width', '0px');
    };
  }, [width]);

  const [visibleAspects, setVisibleAspects] = useState<Set<AspectCategory>>(
    () => {
      try {
        const raw = localStorage.getItem(ASPECTS_KEY);
        if (raw) return new Set(JSON.parse(raw) as AspectCategory[]);
      } catch {
        /* fall through */
      }
      return new Set<AspectCategory>(['harmonious', 'hard', 'conjunction']);
    },
  );

  useEffect(() => {
    localStorage.setItem(
      ASPECTS_KEY,
      JSON.stringify(Array.from(visibleAspects)),
    );
  }, [visibleAspects]);

  const [advanced, setAdvanced] = useState<boolean>(
    () => localStorage.getItem(ADVANCED_KEY) === '1',
  );
  useEffect(() => {
    localStorage.setItem(ADVANCED_KEY, advanced ? '1' : '0');
  }, [advanced]);

  // Respect the Map Filter's planet toggles across every area of the expanded
  // view (planet list, wheel, aspects, overlay aspects), and present them in the
  // conventional luminary-first order (Moon, Sun, Mercury, …).
  const shownPlanets = planets
    .filter((p) => visiblePlanets.has(p.name))
    .sort((a, b) => planetRank(a.name) - planetRank(b.name));
  const shownOverlay =
    overlayPlanets?.filter((p) => visiblePlanets.has(p.name)) ?? null;

  // The four chart angles, gated by the Map Filter's line-type toggles. Same set
  // feeds the wheel labels (visibleAngles) and the data list below it (shownAngles).
  const visibleAngles = new Set<'As' | 'Ds' | 'Mc' | 'Ic'>();
  if (visibleLineTypes.has('ASC')) visibleAngles.add('As');
  if (visibleLineTypes.has('DSC')) visibleAngles.add('Ds');
  if (visibleLineTypes.has('MC')) visibleAngles.add('Mc');
  if (visibleLineTypes.has('IC')) visibleAngles.add('Ic');
  const shownAngles = angles
    ? ([
        { type: 'MC', code: 'Mc', name: 'Midheaven', lon: angles.mc, color: 'var(--cool)' },
        { type: 'IC', code: 'Ic', name: 'Imum Coeli', lon: angles.ic, color: 'var(--cool)' },
        { type: 'ASC', code: 'As', name: 'Ascendant', lon: angles.asc, color: 'var(--accent)' },
        { type: 'DSC', code: 'Ds', name: 'Descendant', lon: angles.dsc, color: 'var(--accent)' },
      ] as const).filter((a) => visibleLineTypes.has(a.type))
    : [];

  // Bold state title for the wheel's top-left corner (always shown when a chart is
  // up). Coloured by the live map state via --map-accent — neutral natal, blue
  // hover, gold pinned, green natal-pin — so it tracks the same palette as the pin.
  const wheelTitle = isNatalPin
    ? 'NATAL CHART'
    : pinned
      ? 'PINNED CHART'
      : point
        ? 'HOVER CHART'
        : 'NATAL CHART';
  // Just the overlay's name for the wheel's top-right corner (the full label
  // "Name · details" lives in the timeline bar); the rest after the separator drops.
  const overlayName = overlayLabel ? overlayLabel.split('·')[0].trim() : null;

  const toggleAspect = (cat: AspectCategory) => {
    setVisibleAspects((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const draggingRef = useRef(false);
  // Cursor-to-edge offset captured at mousedown, so grabbing the handle (which
  // sits a few px inside the right edge) doesn't make the width jump.
  const dragOffsetRef = useRef(0);
  // Mirrors draggingRef as state so we can toggle a class while resizing. The
  // wheel's pixel width trails the pane (it's driven by a ResizeObserver), so
  // mid-drag the SVG is briefly wider than the shrinking pane — which would
  // flash the pane's horizontal scrollbar. We suppress that overflow while
  // dragging (see .expanded-sidebar.dragging .es-wheel-pane).
  const [dragging, setDragging] = useState(false);
  // Latest callback, read inside the once-bound mouseup handler below. Refreshed
  // after each commit (not during render) so the handler sees the current prop.
  const onResizingChangeRef = useRef(onResizingChange);
  useEffect(() => {
    onResizingChangeRef.current = onResizingChange;
  });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const maxWidth = maxSidebarWidth();
      const newWidth = Math.max(
        MIN_WIDTH,
        Math.min(maxWidth, e.clientX + dragOffsetRef.current),
      );
      setWidth(newWidth);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      onResizingChangeRef.current?.(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // The wheel diameter fits the panel width (the sidebar scrolls vertically,
  // so width is the constraint), floored at MIN_WHEEL so it never gets squished.
  const wheelPaneRef = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState(400);

  useEffect(() => {
    if (!wheelPaneRef.current) return;
    const observe = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setPaneWidth(entry.contentRect.width);
    });
    observe.observe(wheelPaneRef.current);
    return () => observe.disconnect();
  }, []);

  const wheelSize = Math.floor(
    Math.max(MIN_WHEEL, Math.min(MAX_WHEEL, paneWidth)),
  );

  const beginDrag = (e: ReactMouseEvent) => {
    draggingRef.current = true;
    setDragging(true);
    onResizingChange?.(true);
    dragOffsetRef.current = width - e.clientX;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  const {
    ref: resizeTipRef,
    pos: resizeTipPos,
    show: showResizeTip,
    hide: hideResizeTip,
  } = useHoverTip<HTMLDivElement>('right');

  return (
    <aside
      className={`expanded-sidebar ${dragging ? 'dragging' : ''}`}
      style={{ width: `${width}px` }}
    >
      <div className="es-scroll">
      <section className="es-section es-section-header">
        <div className="es-header-row">
          <div className="es-switcher">
            <ChartSwitcher
              current={chart}
              charts={charts}
              onSelect={onSelectChart}
              onNew={onNewChart}
              onEdit={onEditChart}
              onDelete={onDeleteChart}
            />
          </div>
          <div className="es-header-actions">
            {angles && (
              <TipButton
                type="button"
                className={`es-advanced-toggle ${advanced ? 'on' : 'off'}`}
                onClick={() => setAdvanced((v) => !v)}
                role="switch"
                aria-checked={advanced}
                placement="bottom"
                tip="Advanced"
                hint="Detailed natal data: declination, speed, retrograde, exact orbs, and the aspect grid."
              >
                <span className="es-toggle-label">Advanced</span>
                <span className="es-toggle-track">
                  <span className="es-toggle-thumb" />
                </span>
              </TipButton>
            )}
            <TipButton
              type="button"
              className="es-close-btn"
              onClick={onClose}
              aria-label="Hide expanded view"
              placement="bottom"
              tip="Hide sidebar"
              hotkey="B"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
                <path d="M16 15l-3-3 3-3" />
              </svg>
              <span>Hide</span>
            </TipButton>
          </div>
        </div>
        {chart && (
          <div className="es-meta">
            <span className="es-meta-when">
              {fmtChartDate(chart)}
              <span className="es-meta-tz">{formatUtcOffset(chart.tzOffset)}</span>
              {chart.tzUncertain && (
                <span
                  className="es-meta-warn"
                  title="Pre-1970 timezone outside US/EU: verify DST against an atlas"
                >
                  ⚠
                </span>
              )}
            </span>
            <span className="es-meta-where">{chart.birthplace.label}</span>
          </div>
        )}
        {(() => {
          const displayPoint =
            point ??
            (chart
              ? { lat: chart.birthplace.lat, lng: chart.birthplace.lng }
              : null);
          if (!displayPoint) return null;
          const stateClass = isNatalPin
            ? 'natal-pinned'
            : pinned
              ? 'pinned'
              : point
                ? ''
                : 'natal';
          const hasPin = isNatalPin || pinned;
          // The chart-state name (NATAL CHART / PINNED CHART / …) already shows in
          // the wheel's top-left corner, so here we show just the pin + coordinates.
          return (
            <div className={`es-relocated ${stateClass}`}>
              <span className="es-relocated-text">
                {hasPin && (
                  <svg
                    className="es-pin-icon"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                )}
                {fmtLat(displayPoint.lat)} {fmtLng(displayPoint.lng)}
              </span>
            </div>
          );
        })()}

      </section>

      <section className="es-section es-section-wheel">
        {/* Use the wheel's empty top corners: the chart-state title (left, always)
            and, when an overlay is on, its caption (right). */}
        {angles && (
          <div className="es-wheel-corner es-wheel-corner-left">
            <span className="es-wheel-title" style={{ color: 'var(--map-accent)' }}>
              {wheelTitle}
            </span>
          </div>
        )}
        {angles && overlayName && (
          <div className="es-wheel-corner es-wheel-corner-right">
            <span className="es-overlay-caption es-overlay-dashed">
              {overlayName}
            </span>
          </div>
        )}
        <div className="es-wheel-pane" ref={wheelPaneRef}>
          {angles ? (
            <WheelSvg
              size={wheelSize}
              angles={angles}
              planets={shownPlanets}
              detailed={true}
              advanced={advanced}
              overlayPlanets={shownOverlay}
              visibleAspects={visibleAspects}
              visibleAngles={visibleAngles}
              interactive
            />
          ) : (
            <div className="es-empty">No chart selected</div>
          )}
        </div>
        {angles && (
          <div className="es-aspect-toggles">
            {ASPECT_TOGGLES.map((t) => {
              const on = visibleAspects.has(t.key);
              return (
                <TipButton
                  key={t.key}
                  type="button"
                  className={`es-asp-toggle ${t.cssClass} ${on ? 'on' : 'off'}`}
                  onClick={() => toggleAspect(t.key)}
                  placement="right"
                  tip={t.label}
                  hint={t.desc}
                >
                  <span className="es-asp-swatch" />
                  <span className="es-asp-label">{t.label}</span>
                </TipButton>
              );
            })}
          </div>
        )}
      </section>

      {/* Planets, now below the wheel. */}
      {angles && (shownPlanets.length > 0 || shownAngles.length > 0) && (() => {
        // Simple view: two columns, row-by-row (even left, odd right).
        const leftCol = shownPlanets.filter((_, i) => i % 2 === 0);
        const rightCol = shownPlanets.filter((_, i) => i % 2 === 1);
        const renderRow = (p: EclipticPosition) => (
          <li key={p.name}>
            <div className="es-row-main">
              <span
                className="es-glyph"
                style={{ color: PLANET_COLORS[p.name] }}
              >
                <PlanetGlyph planet={p.name} size={13} />
              </span>
              <span className="es-name">{PLANET_DISPLAY[p.name]}</span>
              <span className="es-lon">
                <Longitude lon={p.lon} advanced={advanced} />
              </span>
            </div>
          </li>
        );
        // Advanced view: one planet per row across labelled coordinate columns.
        // Geocentric columns come straight off the body; RA/Azimuth/Altitude come
        // from advancedCoords (computed for the relocated observer).
        const renderAdvRow = (p: EclipticPosition) => {
          const hc = advancedCoords.get(p.name);
          const decCls = p.dec !== undefined ? decClass(p.dec) : '';
          return (
            <tr key={p.name}>
              <td className="es-adv-point">
                <span className="es-glyph" style={{ color: PLANET_COLORS[p.name] }}>
                  <PlanetGlyph planet={p.name} size={13} />
                </span>
                <span className="es-name">{PLANET_DISPLAY[p.name]}</span>
                {p.stationary ? (
                  <span className="es-station" title="Stationary">S</span>
                ) : p.retrograde ? (
                  <span className="es-rx" title="Retrograde">℞</span>
                ) : null}
              </td>
              <td className="es-adv-num es-adv-lon">
                <SignLon lon={p.lon} />
              </td>
              <td className="es-adv-num">
                {p.speed !== undefined ? fmtDM(p.speed, true) : '—'}
              </td>
              <td className="es-adv-num">
                {p.lat !== undefined ? fmtDM(p.lat * RAD2DEG, true) : '—'}
              </td>
              <td className="es-adv-num">{hc ? fmtDM(hc.ra * RAD2DEG) : '—'}</td>
              <td
                className={`es-adv-num ${decCls}`}
                title={
                  decCls === 'es-dec-oob'
                    ? 'Out of bounds: beyond the Sun’s 23°26′ declination'
                    : undefined
                }
              >
                {p.dec !== undefined ? fmtDM(p.dec * RAD2DEG, true) : '—'}
              </td>
              <td className="es-adv-num">{hc ? fmtDM(hc.az * RAD2DEG) : '—'}</td>
              <td className="es-adv-num">
                {hc ? fmtDM(hc.alt * RAD2DEG, true) : '—'}
              </td>
            </tr>
          );
        };
        return (
          <section className="es-section es-section-details">
            <div className="es-planets-col">
              {shownPlanets.length > 0 && (
                <>
                  <h3>Planets</h3>
                  {advanced ? (
                    <div className="es-adv-scroll">
                      <table className="es-adv-table">
                        <thead>
                          <tr>
                            <th className="es-adv-point">Point</th>
                            <th className="es-adv-num">Longitude</th>
                            <th className="es-adv-num">Speed</th>
                            <th className="es-adv-num">Latitude</th>
                            <th className="es-adv-num">Rt.Asc.</th>
                            <th className="es-adv-num">Decl.</th>
                            <th className="es-adv-num">Azi(0°N)</th>
                            <th className="es-adv-num">Alti.</th>
                          </tr>
                        </thead>
                        <tbody>{shownPlanets.map(renderAdvRow)}</tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="es-planet-cols">
                      <ul className="es-planet-list">{leftCol.map(renderRow)}</ul>
                      {rightCol.length > 0 && (
                        <ul className="es-planet-list">{rightCol.map(renderRow)}</ul>
                      )}
                    </div>
                  )}
                </>
              )}
              {/* The chart angles get the same treatment as the planets —
                  acronym, name + longitude, two per row (Mc/Ic, As/Ds) — gated
                  by the line-type filter. */}
              {shownAngles.length > 0 && (() => {
                const aLeft = shownAngles.filter((_, i) => i % 2 === 0);
                const aRight = shownAngles.filter((_, i) => i % 2 === 1);
                const renderAngle = ({ code, name, lon, color }: (typeof shownAngles)[number]) => (
                  <li key={code} className={advanced ? 'advanced' : ''}>
                    <div className="es-row-main">
                      <span className="es-glyph es-angle-code" style={{ color }}>
                        {code}
                      </span>
                      <span className="es-name">{name}</span>
                      <span className="es-lon">
                        <Longitude lon={lon} advanced={advanced} />
                      </span>
                    </div>
                  </li>
                );
                return (
                  <>
                    <h3 className="es-angles-h3">Angles</h3>
                    <div className="es-planet-cols">
                      <ul className="es-planet-list">{aLeft.map(renderAngle)}</ul>
                      {aRight.length > 0 && (
                        <ul className="es-planet-list">{aRight.map(renderAngle)}</ul>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </section>
        );
      })()}

      {angles && advanced && (() => {
        const aspects = computeAspects(shownPlanets)
          .filter((a) => visibleAspects.has(a.category))
          .sort((a, b) => a.orb - b.orb);
        if (aspects.length === 0) return null;
        return (
          <section className="es-section es-section-aspects">
            <h3>Aspects ({aspects.length})</h3>
            <ul className="es-aspect-list">
              {aspects.map((a, i) => (
                <li key={i} className={`asp asp-${a.category}`}>
                  <span
                    className="asp-planet"
                    style={{ color: PLANET_COLORS[a.a as PlanetName] }}
                  >
                    <PlanetGlyph planet={a.a as PlanetName} size={12} />
                  </span>
                  <span className="asp-glyph" style={{ color: a.color }}>
                    {ASPECT_GLYPHS[a.type] ?? a.type}
                  </span>
                  <span
                    className="asp-planet"
                    style={{ color: PLANET_COLORS[a.b as PlanetName] }}
                  >
                    <PlanetGlyph planet={a.b as PlanetName} size={12} />
                  </span>
                  <span className="asp-type">{a.type}</span>
                  <span className="asp-orb">{fmtOrb(a.orb)}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })()}

      {angles && advanced && shownOverlay && shownOverlay.length > 0 && (() => {
        // Overlay-first ordering: the overlay body is the subject of the aspect
        // (e.g. "transiting Mars conjunct natal Sun"), so it's listed first and
        // the natal body second.
        const cross = computeCrossAspects(shownOverlay, shownPlanets)
          .filter((a) => visibleAspects.has(a.category))
          .sort((a, b) => a.orb - b.orb);
        if (cross.length === 0) return null;
        return (
          <section className="es-section es-section-aspects es-section-cross">
            <h3>Overlay aspects ({cross.length})</h3>
            <ul className="es-aspect-list">
              {cross.map((a, i) => (
                <li key={i} className={`asp asp-${a.category}`}>
                  <span
                    className="asp-planet asp-planet-overlay"
                    style={{ color: PLANET_COLORS[a.a as PlanetName] }}
                    title="Overlay body"
                  >
                    <PlanetGlyph planet={a.a as PlanetName} size={12} />
                  </span>
                  <span className="asp-glyph" style={{ color: a.color }}>
                    {ASPECT_GLYPHS[a.type] ?? a.type}
                  </span>
                  <span
                    className="asp-planet"
                    style={{ color: PLANET_COLORS[a.b as PlanetName] }}
                  >
                    <PlanetGlyph planet={a.b as PlanetName} size={12} />
                  </span>
                  <span className="asp-type">{a.type}</span>
                  <span className="asp-orb">{fmtOrb(a.orb)}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })()}
      </div>

      <div
        ref={resizeTipRef}
        className="es-drag-handle"
        onMouseDown={beginDrag}
        onMouseEnter={showResizeTip}
        onMouseLeave={hideResizeTip}
        role="separator"
        aria-orientation="vertical"
      >
        <div className="es-drag-grip" />
      </div>
      <HoverTip pos={resizeTipPos} placement="right" title="Drag to resize" />
    </aside>
  );
}
