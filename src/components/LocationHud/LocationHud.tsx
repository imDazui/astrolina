// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { PlaceResult } from '../../lib/atlas/cityLookup';
import type { LsOriginPref } from '../../lib/overlayPrefs';
import { useT } from '../../i18n';
import { useMovableHud } from '../../lib/useMovableHud';
import { HoverTip } from '../ui/HoverTip';
import { ClickIcon } from '../ui/ClickIcon';
import { useHoverTip } from '../ui/useHoverTip';
import { CLOSE_ZOOM } from '../Map/Map';
// Reuse the overlay bar's chrome (.timeline-hud + its per-theme overrides), so the
// window frosts/recolors with the theme for free.
import '../TimelineHud/TimelineHud.css';
import './LocationHud.css';

const POS_KEY = 'astro:location-pos:v1';
// "Fly to origin" lands at the map's CLOSE_ZOOM — the compass is full-size there, and
// it's the threshold that surfaces the map's "Zoom out" button, so you arrive already
// "zoomed in" to the local horizon.
const FLY_TO_ORIGIN_ZOOM = CLOSE_ZOOM;

interface LocationHudProps {
  /** Fly the map camera to a coordinate at a given zoom (does not pin/relocate). */
  onFlyTo: (lat: number, lng: number, zoom?: number) => void;
  /** Toggle between the current spot and the one before the last jump. */
  onGoBack: () => void;
  /** Whether (and which way) the back/forward toggle points: 'none' hides it. */
  backState: 'none' | 'back' | 'forward';
  /** Coordinate the next Go back / Return press flies to — shown beside the button
   *  as a rough place name so the user sees where they're about to jump. */
  teleportTarget: { lat: number; lng: number } | null;
  onClose: () => void;
  // ── Local Space (moved here from Map Filters) ──────────────────────────────
  showLocalSpace: boolean;
  setShowLocalSpace: (v: boolean) => void;
  lsOrigin: LsOriginPref;
  setLsOrigin: (o: LsOriginPref) => void;
  hideLsInbound: boolean;
  setHideLsInbound: (v: boolean) => void;
  hideLsCompass: boolean;
  setHideLsCompass: (v: boolean) => void;
  /** The point the local-space lines radiate from (pin or birthplace); null when
   *  there's nothing to anchor to — disables "Fly to origin". */
  localSpaceOrigin: { lat: number; lng: number } | null;
}

// Eye (shown) / eye-off (hidden) marker for the local-space toggles — mirrors the
// sidebar's show/hide affordance; colour is inherited from the button via currentColor.
function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="location-ls-eye"
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
      {open ? (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      )}
    </svg>
  );
}

// The map-pin teardrop (same glyph as elsewhere in the UI) — shown in the "From the
// pin" origin button so the choice reads at a glance. Inherits the button's colour.
function PinIcon() {
  return (
    <svg
      className="location-ls-pin"
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

// The "From the pin" label with the pin glyph slotted just before its final word
// ("From the [icon] pin"). The text comes from i18n; splitting on the last space keeps
// the words translatable. The button is an inline-flex row, so the parts space via its
// gap. (The button's tooltip keeps the plain, un-iconified label.)
function PinOriginLabel({ label }: { label: string }) {
  const i = label.lastIndexOf(' ');
  if (i < 0) {
    return (
      <>
        <PinIcon />
        {label}
      </>
    );
  }
  return (
    <>
      {label.slice(0, i)}
      <PinIcon />
      {label.slice(i + 1)}
    </>
  );
}

// A button that reveals a shared .ui-tip (title + hint) on hover/focus — used for the
// Local Space toggles, the origin segmented control, and "Fly to origin".
function LsTipButton({
  className,
  onClick,
  ariaPressed,
  disabled,
  title,
  hint,
  children,
}: {
  className: string;
  onClick: () => void;
  ariaPressed?: boolean;
  disabled?: boolean;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  const { ref, pos, show, hide } = useHoverTip<HTMLButtonElement>('top');
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={className}
        onClick={onClick}
        aria-pressed={ariaPressed}
        disabled={disabled}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </button>
      <HoverTip pos={pos} placement="top" title={title} hint={hint} />
    </>
  );
}

// A movable window that flies the map to any place AND hosts the local-space
// controls — the two faces of "where am I standing, and what's the sky from here".
// Search a city, region or country and jump straight there (e.g. Oklahoma → Hong
// Kong) without panning; fully offline (bundled GeoNames set only, no third-party
// API), zoomed by precision. Camera-only: it doesn't move the pin/chart. Below the
// search sits Local Space: show/hide, origin, inbound/compass visibility, and a jump
// to the origin.
export function LocationHud({
  onFlyTo,
  onGoBack,
  backState,
  teleportTarget,
  onClose,
  showLocalSpace,
  setShowLocalSpace,
  lsOrigin,
  setLsOrigin,
  hideLsInbound,
  setHideLsInbound,
  hideLsCompass,
  setHideLsCompass,
  localSpaceOrigin,
}: LocationHudProps) {
  const { t } = useT();
  const hudRef = useRef<HTMLDivElement>(null);
  const { pos, dragging, handleProps } = useMovableHud(hudRef, {
    posKey: POS_KEY,
    floating: true,
    // Default centred horizontally, below the top bar + its readout row.
    initial: () => ({ x: Math.round(window.innerWidth / 2 - 160), y: 112 }),
  });
  // The grip's drag hint as the shared .ui-tip (portaled, so it isn't clipped by
  // the window frame); points up from the header, hidden while dragging.
  const {
    ref: gripRef,
    pos: gripTipPos,
    show: showGripTip,
    hide: hideGripTip,
  } = useHoverTip<HTMLDivElement>('top');
  // Hover tip for the Go back/forward button — surfaces its Backspace shortcut.
  const {
    ref: backTipRef,
    pos: backTipPos,
    show: showBackTip,
    hide: hideBackTip,
  } = useHoverTip<HTMLButtonElement>('top');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  // Rough place name for the back/forward target (where the next press jumps to).
  const [targetName, setTargetName] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The label just jumped to — suppresses re-searching it after a pick.
  const pickedRef = useRef<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Resolve the back/forward target to a rough place name (nearest bundled city,
  // generous radius), lazily — reusing the same offline dataset as the search, so
  // the heavy chunk stays out of the main bundle.
  useEffect(() => {
    if (!teleportTarget) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTargetName(null);
      return;
    }
    let cancelled = false;
    import('../../lib/atlas/cityLookup').then(({ nearestCity }) => {
      if (cancelled) return;
      const r = nearestCity(teleportTarget.lat, teleportTarget.lng, 1500);
      setTargetName(r ? r.label : null);
    });
    return () => {
      cancelled = true;
    };
  }, [teleportTarget]);

  // Debounced offline search over the bundled GeoNames data (cities + admin-1
  // regions + countries). The dataset is a lazy chunk, so the first search awaits
  // its import; thereafter the lookup is synchronous and sub-millisecond.
  useEffect(() => {
    if (query === pickedRef.current) return;
    if (query.trim().length < 2) {
      // Clearing stale results belongs to this debounced effect (it owns the search
      // lifecycle) and can't be derived during render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    let cancelled = false;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      const { searchPlaces } = await import('../../lib/atlas/cityLookup');
      if (cancelled) return;
      const found = searchPlaces(query, 8);
      setResults(found);
      setActiveIdx(found.length ? 0 : -1);
      setSearching(false);
    }, 250);
    return () => {
      cancelled = true;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  const jump = (r: PlaceResult) => {
    onFlyTo(r.lat, r.lng, r.zoom);
    pickedRef.current = r.label;
    setQuery(r.label);
    setResults([]);
    setActiveIdx(-1);
    // Re-select the text so the next keystroke starts a fresh search.
    requestAnimationFrame(() => inputRef.current?.select());
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[activeIdx] ?? results[0];
      if (r) jump(r);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (results.length) setResults([]);
      else onClose();
    }
  };

  return (
    <div
      ref={hudRef}
      className={`timeline-hud location-hud${dragging ? ' thud-dragging' : ''}`}
      style={
        pos
          ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', transform: 'none' }
          : undefined
      }
    >
      <div className="location-header">
        <div
          className="location-grip"
          {...handleProps}
          ref={gripRef}
          onMouseEnter={showGripTip}
          onMouseLeave={hideGripTip}
        >
          <span className="hud-grip" aria-hidden="true" />
          <span className="location-title">{t('locationHud.title')}</span>
        </div>
        <HoverTip
          pos={dragging ? null : gripTipPos}
          placement="top"
          title={t('common.hud.dragToMove')}
          hint={
            <span className="hud-dock-line">
              <span className="ui-tip-hotkey hud-dock-key">
                {t('common.hud.dockKey')}
                <ClickIcon className="hud-dock-icon" />
              </span>
              {t('common.hud.recentreHint')}
            </span>
          }
        />
        <button
          type="button"
          className="location-close"
          onClick={onClose}
          aria-label={t('locationHud.closeAria')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
      </div>

      <div className="location-search">
        <svg className="location-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="location-input"
          value={query}
          onChange={(e) => {
            pickedRef.current = null;
            setQuery(e.target.value);
          }}
          onKeyDown={onKeyDown}
          placeholder={t('locationHud.placeholder')}
          spellCheck={false}
          autoComplete="off"
          aria-label={t('locationHud.searchAria')}
        />
        {searching && <span className="location-spinner" aria-hidden="true" />}
      </div>

      {results.length > 0 && (
        <ul className="location-results">
          {results.map((r, i) => (
            <li key={`${r.kind}-${r.label}-${r.lat}-${r.lng}-${i}`}>
              <button
                type="button"
                className={`location-result${i === activeIdx ? ' active' : ''}`}
                onClick={() => jump(r)}
                onMouseEnter={() => setActiveIdx(i)}
              >
                <span className="location-result-main">
                  <span className="location-result-label">{r.label}</span>
                  <span className={`location-kind location-kind-${r.kind}`}>{t(`locationHud.kind.${r.kind}`)}</span>
                </span>
                <span className="location-result-coord">
                  {Math.abs(r.lat).toFixed(1)}°{r.lat >= 0 ? 'N' : 'S'}{' '}
                  {Math.abs(r.lng).toFixed(1)}°{r.lng >= 0 ? 'E' : 'W'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {backState !== 'none' && (
        <div className="location-actions">
          <button
            ref={backTipRef}
            type="button"
            className="location-back-btn"
            onClick={onGoBack}
            onMouseEnter={showBackTip}
            onMouseLeave={hideBackTip}
            onFocus={showBackTip}
            onBlur={hideBackTip}
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
              {backState === 'forward' ? (
                <path d="M5 12h14M13 6l6 6-6 6" />
              ) : (
                <path d="M19 12H5M11 6l-6 6 6 6" />
              )}
            </svg>
            <span>{backState === 'forward' ? t('locationHud.goForward') : t('locationHud.goBack')}</span>
          </button>
          {targetName && (
            <span className="location-back-target">{targetName}</span>
          )}
          <HoverTip
            pos={backTipPos}
            placement="top"
            title={backState === 'forward' ? t('locationHud.goForward') : t('locationHud.goBack')}
            hotkey="Backspace"
          />
        </div>
      )}

      {/* Local Space lives here now (it left Map Filters): the master show toggle is
          always present; the rest reveal once it's on. */}
      <div className="location-ls">
        <div className="location-ls-head">{t('locationHud.localSpaceSection')}</div>
        <LsTipButton
          className={`location-ls-toggle ${showLocalSpace ? 'on' : 'off'}`}
          onClick={() => setShowLocalSpace(!showLocalSpace)}
          ariaPressed={showLocalSpace}
          title={t('locationHud.localSpace.title')}
          hint={t('locationHud.localSpace.hint')}
        >
          <EyeIcon open={showLocalSpace} />
          <span className="location-ls-name">{t('locationHud.localSpace.title')}</span>
        </LsTipButton>
        {showLocalSpace && (
          <>
            {/* Origin: where the lines radiate from. Segmented (two options) rather
                than a dropdown — fits the narrow HUD and reads at a glance. */}
            <div className="location-ls-seg" role="group">
              {(['pin', 'birthplace'] as const).map((o) => (
                <LsTipButton
                  key={o}
                  className={`location-ls-seg-btn location-ls-seg-${o} ${lsOrigin === o ? 'active' : ''}`}
                  onClick={() => setLsOrigin(o)}
                  ariaPressed={lsOrigin === o}
                  title={t(`locationHud.lsOrigin.${o}`)}
                  hint={t(`locationHud.lsOrigin.${o}Hint`)}
                >
                  {o === 'pin' ? (
                    <PinOriginLabel label={t('locationHud.lsOrigin.pin')} />
                  ) : (
                    t(`locationHud.lsOrigin.${o}`)
                  )}
                </LsTipButton>
              ))}
            </div>
            <LsTipButton
              className={`location-ls-toggle ${!hideLsInbound ? 'on' : 'off'}`}
              onClick={() => setHideLsInbound(!hideLsInbound)}
              ariaPressed={hideLsInbound}
              title={t('locationHud.hideInbound.title')}
              hint={t('locationHud.hideInbound.hint')}
            >
              <EyeIcon open={!hideLsInbound} />
              <span className="location-ls-name">{t('locationHud.hideInbound.title')}</span>
            </LsTipButton>
            <LsTipButton
              className={`location-ls-toggle ${!hideLsCompass ? 'on' : 'off'}`}
              onClick={() => setHideLsCompass(!hideLsCompass)}
              ariaPressed={hideLsCompass}
              title={t('locationHud.hideCompass.title')}
              hint={t('locationHud.hideCompass.hint')}
            >
              <EyeIcon open={!hideLsCompass} />
              <span className="location-ls-name">{t('locationHud.hideCompass.title')}</span>
            </LsTipButton>
            <LsTipButton
              className="location-ls-fly"
              onClick={() => {
                if (localSpaceOrigin)
                  onFlyTo(localSpaceOrigin.lat, localSpaceOrigin.lng, FLY_TO_ORIGIN_ZOOM);
              }}
              disabled={!localSpaceOrigin}
              title={t('locationHud.flyToOrigin.title')}
              hint={t('locationHud.flyToOrigin.hint')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="7" />
                <path d="M12 1v3" />
                <path d="M12 20v3" />
                <path d="M1 12h3" />
                <path d="M20 12h3" />
                <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
              </svg>
              <span>{t('locationHud.flyToOrigin.title')}</span>
            </LsTipButton>
          </>
        )}
      </div>
    </div>
  );
}
