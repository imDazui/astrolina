// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The SKY BAND (View ▸ Sky Times): a bottom bar that takes REAL layout space —
// the map genuinely shrinks above it (App passes the height to <Map bottomInset>
// and publishes it to the bottom-dock registry so the rest of the chrome lifts).
// The core band is the compact row: the body LEGEND on the left (each visible
// body's glyph + name; hover = its four angle times at the active point, in
// that place's own clock) and the context column on the right (place, day pager
// ‹ › + Today, zone, close). A downstream build may register an expandable
// TRACK for the center (lib/extensions/skyBandTrack.ts) — its eye-toggle shows
// here only when registered AND entitled (no teaser), tagged with the gated
// tier in its hover tip. Chart-time-INDEPENDENT: the band reads the sky of the
// chosen DAY, so it works even for unknown-birth-time charts. On PHONES the
// same DOM reflows to stacked rows (track / legend / context — see the CSS)
// and the band pads itself by the home-indicator inset; the legend's tips are
// tap-revealed there.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { PLANET_COLORS, type NodeType, type PlanetName } from '../../lib/ephemeris';
import { dailySkyEvents, type BodyDayEvents, type EventKind } from '../../lib/astro/riseSet';
import {
  getSkyBandTrack,
  isSkyBandTrackEntitled,
  type SkyBandTrackContext,
} from '../../lib/extensions/skyBandTrack';
import { getIanaTimezone, offsetHoursAt, zoneLabelAt } from '../../lib/atlas/timezone';
import { usePhone } from '../../lib/touch';
import { planetRank } from '../../lib/astro/format';
import { useT } from '../../i18n';
import { TipButton, TipSpan } from '../ui/HoverTip';
import { EyeIcon } from '../ui/EyeIcon';
import { ClockIcon } from '../ui/ClockIcon';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import { TimelineDateModal } from '../TimelineDateModal/TimelineDateModal';
import { BIRTH_YEAR_MIN, BIRTH_YEAR_MAX } from '../DateTimeFields/DateTimeFields';
import './SkyBand.css';

/** The compact band's reserved height (px). App feeds the ACTIVE height to
 *  <Map bottomInset> and the bottom-dock registry: this while the row is
 *  compact, the registered track's own `height` while it shows. */
export const SKY_BAND_H_COMPACT = 28;

/** The phone layout's two stacked rows (legend + context, 28px each). App adds
 *  the registered track's height while it shows, the bottom safe-area inset AND
 *  the tap cushion below (the band pads itself by both), so the published
 *  height is the band's TOTAL. */
export const SKY_BAND_H_PHONE = 56;

/** Extra bottom breathing room (px) under the phone rows, beyond the safe-area
 *  inset: keeps the context row's controls — the ✕ hugs the bottom-right —
 *  clear of the display's rounded corners and comfortably tappable, and lifts
 *  the row off the raw screen edge on inset-less (home-button) phones. Kept in
 *  sync with the padding-bottom in SkyBand.css's .is-phone rule. */
export const SKY_BAND_PHONE_CUSHION = 8;

/** Persisted density preference: absent/0 = compact (hover a body for its times), 1 = the times
 *  listed inline. Remembered across sessions so the chosen density sticks. */
const TIMES_KEY = 'astro:sky-times-verbose:v1';

const MS_DAY = 86_400_000;
// Unix epoch ms → Julian Day (UT).
const msToJD = (ms: number) => ms / MS_DAY + 2440587.5;
const jdToMs = (jd: number) => (jd - 2440587.5) * MS_DAY;

/** The four angle moments in the legend card's order (matches the old table). */
const KINDS: EventKind[] = ['rise', 'culminate', 'set', 'anticulminate'];

interface SkyBandProps {
  /** The instrument point: the placed pin, else the active chart's birthplace. */
  point: { lat: number; lng: number } | null;
  placeLabel: string | null;
  visiblePlanets: Set<PlanetName>;
  nodeType: NodeType;
  /** Whether the registered track (if any, and entitled) is expanded. Owned by
   *  App — the map's bottomInset must follow the band's height. */
  trackShown: boolean;
  onToggleTrack: () => void;
  /** The Slide tool's slid instant (epoch ms UT) while it spins the sky — handed
   *  to the track so its time cursor can follow the spin. Null = idle. */
  slideMs?: number | null;
  onClose: () => void;
}

export function SkyBand({
  point,
  placeLabel,
  visiblePlanets,
  nodeType,
  trackShown,
  onToggleTrack,
  slideMs = null,
  onClose,
}: SkyBandProps) {
  const { t, fmt } = useT();
  // Phone-sized screens reflow the band to stacked rows (the is-phone class —
  // the CSS owns the layout; the DOM is the same either way).
  const phone = usePhone();
  // Day pager: offset from "today", anchored once per mount so the band doesn't
  // slide under the reader at local midnight.
  const [dayOffset, setDayOffset] = useState(0);
  const [nowMs] = useState(() => Date.now());
  // The day readout doubles as a button opening the shared moment picker (the
  // same editor the timeline bar and My Charts use), for jumps the ‹ › pager
  // can't reasonably make — decades into the past or future.
  const [pickerOpen, setPickerOpen] = useState(false);
  // Density toggle: compact (glyphs; hover a body for its times) vs. verbose (the times listed
  // inline, no hover needed). Persisted so the choice sticks across sessions.
  const [showTimes, setShowTimes] = useState<boolean>(() => {
    try {
      return localStorage.getItem(TIMES_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleTimes = () =>
    setShowTimes((v) => {
      const next = !v;
      try {
        localStorage.setItem(TIMES_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  const legendRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startScroll: number; active: boolean } | null>(null);

  // The place's own zone — the whole band reads in LOCAL time there.
  const zone = useMemo(
    () => (point ? getIanaTimezone(point.lat, point.lng) : null),
    [point],
  );

  // Local midnight (start of the shown day) as a UT instant: shift to wall
  // clock, floor to the wall-clock day, shift back. A DST jump inside the day
  // moves one edge by an hour — fine for a daily instrument.
  const dayStart = useMemo(() => {
    if (!point || !zone) return null;
    const refMs = nowMs + dayOffset * MS_DAY;
    const offH = offsetHoursAt(zone, refMs);
    const wallMs = refMs + offH * 3_600_000;
    const wallMidnight = Math.floor(wallMs / MS_DAY) * MS_DAY;
    return wallMidnight - offH * 3_600_000;
  }, [point, zone, nowMs, dayOffset]);

  const days = useMemo<BodyDayEvents[]>(() => {
    if (!point || dayStart === null) return [];
    const bodies = [...visiblePlanets].sort((a, b) => planetRank(a) - planetRank(b));
    return dailySkyEvents(msToJD(dayStart), point.lat, point.lng, bodies, nodeType);
  }, [point, dayStart, visiblePlanets, nodeType]);

  // Wall-clock helpers (shared with the track through its context).
  const clock = (jd: number): string => {
    if (!zone) return '—';
    const ms = jdToMs(jd);
    const wall = new Date(ms + offsetHoursAt(zone, ms) * 3_600_000);
    return `${String(wall.getUTCHours()).padStart(2, '0')}:${String(wall.getUTCMinutes()).padStart(2, '0')}`;
  };
  const dayLabel = useMemo(() => {
    if (dayStart === null || !zone) return '';
    const noonMs = dayStart + MS_DAY / 2;
    const wall = new Date(noonMs + offsetHoursAt(zone, noonMs) * 3_600_000);
    // Phones abbreviate the month: the pager can't shrink, so a full "December"
    // would crush the place label beside it in the context row.
    const month = (phone ? fmt.monthAbbr : fmt.monthName)(wall.getUTCMonth() + 1);
    return `${wall.getUTCDate()} ${month} ${wall.getUTCFullYear()}`;
  }, [dayStart, zone, fmt, phone]);
  // An instant's wall-clock fraction of the shown day (the track's x-mapping).
  // Both ends use the offset AT THEIR OWN instant, so DST days place every
  // marker at its true local clock position.
  const frac = (jd: number): number => {
    if (dayStart === null || !zone) return -1;
    const ms = jdToMs(jd);
    const wallMs = ms + offsetHoursAt(zone, ms) * 3_600_000;
    const wallMidnight = dayStart + offsetHoursAt(zone, dayStart) * 3_600_000;
    return (wallMs - wallMidnight) / MS_DAY;
  };

  const kindLabel = (k: EventKind) => t(`skyTimes.col.${k}`);
  const bodyName = (p: PlanetName) => t(`planets.${p}.name`);
  // The colored body glyph, as the hover-tip PREFIX where the tip names a body.
  const tipGlyph = (p: PlanetName) => (
    <PlanetGlyph planet={p} size={14} color={PLANET_COLORS[p]} />
  );

  // The per-body times card (the legend hover's hint).
  const timesCard = (d: BodyDayEvents): ReactNode => (
    <span className="sky-band-card">
      {KINDS.map((k) => {
        const jd =
          k === 'rise' ? d.rise : k === 'set' ? d.set : k === 'culminate' ? d.culminate : d.anticulminate;
        return (
          <span key={k} className="sky-band-card-row">
            <span className="sky-band-card-kind">{kindLabel(k)}</span>
            <span>{jd !== null ? clock(jd) : '—'}</span>
          </span>
        );
      })}
      {d.circumpolar && (
        <span className="sky-band-card-note">
          {d.circumpolar === 'up' ? t('skyTimes.circumpolarUp') : t('skyTimes.circumpolarDown')}
        </span>
      )}
    </span>
  );

  // Verbose row: the same four moments as the hover card, laid out inline after the body so they
  // read without hovering. A circumpolar body has no rise/set, so it shows its all-day note
  // instead. The angle tags (ASC / MC / DSC / IC) match the card's labels.
  const inlineTimes = (d: BodyDayEvents): ReactNode =>
    d.circumpolar ? (
      <span className="sky-band-times sky-band-times-note">
        {d.circumpolar === 'up' ? t('skyTimes.circumpolarUp') : t('skyTimes.circumpolarDown')}
      </span>
    ) : (
      <span className="sky-band-times">
        {KINDS.map((k) => {
          const jd =
            k === 'rise'
              ? d.rise
              : k === 'set'
                ? d.set
                : k === 'culminate'
                  ? d.culminate
                  : d.anticulminate;
          return (
            <span key={k} className="sky-band-time">
              <span className="sky-band-time-kind">{kindLabel(k)}</span>
              <span>{jd !== null ? clock(jd) : '—'}</span>
            </span>
          );
        })}
      </span>
    );

  // The registered track (a downstream build's expandable center), entitled-only
  // — NO teaser: without entitlement neither the track nor its toggle exists.
  const trackExt = getSkyBandTrack();
  const trackAvailable = !!trackExt && isSkyBandTrackEntitled(trackExt);
  const trackVisible = trackAvailable && trackShown && !!point && !!zone && dayStart !== null;
  const trackCtx: SkyBandTrackContext | null =
    trackVisible && point && zone && dayStart !== null
      ? { point, zone, dayStart, days, frac, clock, slideMs }
      : null;

  // Verbose (inline times) only applies to the compact single row — the expanded track draws the
  // times itself, and its legend is a 4-row grid.
  const inlineMode = showTimes && !trackVisible;

  // Edge fades for the compact legend: with the times shown it easily runs wider than the space
  // before the context column. --fade-l/--fade-r (read by the mask in the CSS) cue that there's
  // more off either edge; 0 means that side is at its end. Re-measured on scroll, resize, and
  // whenever the row's content changes (day, planets, density).
  useEffect(() => {
    const el = legendRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const FADE = 24;
      el.style.setProperty('--fade-l', el.scrollLeft > 1 ? `${FADE}px` : '0px');
      el.style.setProperty('--fade-r', el.scrollLeft < max - 1 ? `${FADE}px` : '0px');
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [days, inlineMode, trackVisible]);

  // Mouse drag-to-scroll (touch / pen keep native scrolling). A small movement threshold lets a
  // plain click / hover through untouched; once it's really a drag we capture the pointer and mute
  // the bodies (via the is-dragging class) so no stray hover fires mid-drag.
  const onLegendPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || trackVisible) return; // mouse only, and only the compact row
    const el = legendRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    dragRef.current = { startX: e.clientX, startScroll: el.scrollLeft, active: false };
  };
  const onLegendPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = legendRef.current;
    if (!d || !el) return;
    const dx = e.clientX - d.startX;
    if (!d.active) {
      if (Math.abs(dx) < 5) return;
      d.active = true;
      el.classList.add('is-dragging');
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = d.startScroll - dx;
  };
  const onLegendPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = legendRef.current;
    dragRef.current = null;
    if (d?.active && el) {
      el.classList.remove('is-dragging');
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      className={`sky-band${trackVisible ? '' : ' is-compact'}${inlineMode ? ' is-verbose' : ''}${phone ? ' is-phone' : ''}`}
      role="region"
      aria-label={t('skyTimes.title')}
    >
      {!point ? (
        <div className="sky-band-empty">
          <span>{t('skyTimes.noPlace')}</span>
        </div>
      ) : (
        <>
          {/* LEFTMOST — density toggle: compact glyphs (hover for a body's times) ⇄ the times
              listed inline. Only in the compact row; the expanded track shows the times itself. */}
          {!trackVisible && days.length > 0 && (
            <TipButton
              type="button"
              className={`sky-band-detail-toggle${showTimes ? ' on' : ''}`}
              placement="top"
              aria-pressed={showTimes}
              tip={t(showTimes ? 'skyTimes.detail.tipHide' : 'skyTimes.detail.tipShow')}
              hint={t('skyTimes.detail.hint')}
              onClick={toggleTimes}
            >
              <EyeIcon open={showTimes} className="sky-band-track-eye" size={13} />
              <span>{t('skyTimes.detail.label')}</span>
            </TipButton>
          )}

          {/* LEFT — the body legend: glyph + name (hover = the four-times card), or with the times
              listed inline when the density toggle is on. Scrolls / drags when it runs wider than
              the space before the context column, its edges fading to cue that. */}
          <div
            ref={legendRef}
            className="sky-band-legend"
            onPointerDown={onLegendPointerDown}
            onPointerMove={onLegendPointerMove}
            onPointerUp={onLegendPointerEnd}
            onPointerCancel={onLegendPointerEnd}
          >
            {days.map((d) => (
              <TipSpan
                key={d.body}
                className={`sky-band-body${d.circumpolar === 'down' ? ' is-dim' : ''}`}
                placement="top"
                tapReveal
                tip={
                  <span className="sky-band-tip">
                    {tipGlyph(d.body)}
                    <span>{bodyName(d.body)}</span>
                  </span>
                }
                hint={inlineMode ? undefined : timesCard(d)}
              >
                <PlanetGlyph planet={d.body} size={14} color={PLANET_COLORS[d.body]} />
                <span className="sky-band-body-name">{bodyName(d.body)}</span>
                {inlineMode && inlineTimes(d)}
              </TipSpan>
            ))}
          </div>

          {/* CENTER — the registered track, while expanded. */}
          {trackCtx && trackExt && (
            <div className="sky-band-center">{trackExt.render(trackCtx)}</div>
          )}

          {/* RIGHT — the context column: place, day pager, zone, track toggle.
              (The close ✕ sits outside, on the band's far right edge.) */}
          <div className="sky-band-side">
            {placeLabel && (
              <div className="sky-band-side-row">
                <span className="sky-band-place">{placeLabel}</span>
              </div>
            )}
            <div className="sky-band-side-row">
              <button
                type="button"
                className="sky-band-day-btn"
                aria-label={t('skyTimes.prevDay')}
                onClick={() => setDayOffset((d) => d - 1)}
              >
                ‹
              </button>
              <TipButton
                type="button"
                className="sky-band-day-btn sky-band-day"
                placement="top"
                tip={t('skyTimes.pickDate')}
                hint={t('skyTimes.pickDateHint')}
                onClick={() => setPickerOpen(true)}
              >
                {dayLabel}
              </TipButton>
              <button
                type="button"
                className="sky-band-day-btn"
                aria-label={t('skyTimes.nextDay')}
                onClick={() => setDayOffset((d) => d + 1)}
              >
                ›
              </button>
              {/* Today is always offered; it just greys out while already on it. */}
              <button
                type="button"
                className="sky-band-day-btn sky-band-today"
                disabled={dayOffset === 0}
                onClick={() => setDayOffset(0)}
              >
                {t('skyTimes.today')}
              </button>
            </div>
            <div className="sky-band-side-row">
              {/* The zone is information, not an action — a clock icon + plain
                  text with a hover note. */}
              {zone && (
                <TipSpan
                  className="sky-band-zone"
                  placement="top"
                  tapReveal
                  tip={t('skyTimes.zoneNote', { zone })}
                >
                  <ClockIcon className="sky-band-zone-icon" size={12} />
                  <span>{zone.split('/').pop()?.replace(/_/g, ' ') ?? zone}</span>
                </TipSpan>
              )}
              {/* The track's eye-toggle (only when a track is registered AND
                  entitled — no teaser); a gated track carries the gated-tier
                  tag in its hover tip. */}
              {trackAvailable && trackExt && (
                <TipButton
                  type="button"
                  className={`sky-band-track-toggle${trackShown ? ' on' : ''}`}
                  placement="top"
                  aria-pressed={trackShown}
                  gated={trackExt.tier === 'gated'}
                  tip={trackExt.label}
                  hint={trackShown ? trackExt.onHint : trackExt.offHint}
                  onClick={onToggleTrack}
                >
                  <EyeIcon open={trackShown} className="sky-band-track-eye" size={13} />
                  <span>{trackExt.label}</span>
                </TipButton>
              )}
            </div>
          </div>

          {/* The shared moment picker (no native calendar widget), in its
              date-only dress — the band is a day instrument, so the time boxes
              would only confuse. Seeded to the shown day's local noon; the
              chosen instant maps back to a whole-day pager offset in the
              point's own zone (per-instant offsets, so distant DST states
              self-correct). */}
          {pickerOpen && zone && dayStart !== null && (
            <TimelineDateModal
              valueMs={dayStart + MS_DAY / 2}
              offsetMs={offsetHoursAt(zone, dayStart + MS_DAY / 2) * 3_600_000}
              zoneLabel={zoneLabelAt(zone, dayStart + MS_DAY / 2)}
              yearMin={BIRTH_YEAR_MIN}
              yearMax={BIRTH_YEAR_MAX}
              dateOnly
              title={t('skyTimes.pickDate')}
              onApply={(ms) => {
                const wallDay = (v: number) =>
                  Math.floor((v + offsetHoursAt(zone, v) * 3_600_000) / MS_DAY);
                setDayOffset(wallDay(ms) - wallDay(nowMs));
              }}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </>
      )}

      {/* Close ✕ — always the band's far-right edge (both states, compact or
          expanded), vertically centred. */}
      <button
        type="button"
        className="sky-band-close"
        aria-label={t('skyTimes.closeAria')}
        onClick={onClose}
      >
        ×
      </button>
    </div>
  );
}
