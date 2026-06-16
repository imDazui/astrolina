// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useRef } from 'react';
import type { ReactNode } from 'react';
import type { LsOriginPref } from '../../lib/overlayPrefs';
import { useT } from '../../i18n';
import { useMovableHud, effectiveCenterX } from '../../lib/useMovableHud';
import { HoverTip } from '../ui/HoverTip';
import { ClickIcon } from '../ui/ClickIcon';
import { useHoverTip } from '../ui/useHoverTip';
import { CLOSE_ZOOM } from '../Map/Map';
// Reuse the overlay bar's chrome (.timeline-hud) + the shared location-window styles
// (.location-* classes), so the window frosts/recolors with the theme for free.
import '../TimelineHud/TimelineHud.css';
import '../LocationHud/LocationHud.css';

// Its own saved position (independent of the Teleport window).
const POS_KEY = 'astro:localspace-pos:v1';
// "Fly to origin" lands at the map's CLOSE_ZOOM — the compass is full-size there, and
// it's the threshold that surfaces the map's "Zoom out" button, so you arrive already
// "zoomed in" to the local horizon.
const FLY_TO_ORIGIN_ZOOM = CLOSE_ZOOM;

interface LocalSpaceHudProps {
  /** Fly the map camera to a coordinate at a given zoom (does not pin/relocate). */
  onFlyTo: (lat: number, lng: number, zoom?: number) => void;
  onClose: () => void;
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
// the words translatable. (The button's tooltip keeps the plain, un-iconified label.)
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
// origin segmented control, the hide toggles, and "Fly to origin".
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

// A movable window hosting the local-space controls: where the lines radiate from
// (pin or birthplace), inbound/compass visibility, and a jump to the origin. The
// window's mere being-open draws the lines — opening it turns Local Space on, closing
// it off — so there's no separate show/hide toggle inside.
export function LocalSpaceHud({
  onFlyTo,
  onClose,
  lsOrigin,
  setLsOrigin,
  hideLsInbound,
  setHideLsInbound,
  hideLsCompass,
  setHideLsCompass,
  localSpaceOrigin,
}: LocalSpaceHudProps) {
  const { t } = useT();
  const hudRef = useRef<HTMLDivElement>(null);
  const { pos, dragging, handleProps } = useMovableHud(hudRef, {
    posKey: POS_KEY,
    floating: true,
    // Default centred horizontally on the effective centre, below the top bar — but
    // offset a touch from the Teleport window so the two don't open exactly stacked.
    initial: () => ({ x: Math.round(effectiveCenterX() - 130), y: 144 }),
  });
  // The grip's drag hint as the shared .ui-tip (portaled, so it isn't clipped by
  // the window frame); points up from the header, hidden while dragging.
  const {
    ref: gripRef,
    pos: gripTipPos,
    show: showGripTip,
    hide: hideGripTip,
  } = useHoverTip<HTMLDivElement>('top');

  return (
    <div
      ref={hudRef}
      className={`timeline-hud location-hud local-space-hud${dragging ? ' thud-dragging' : ''}`}
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
          <span className="location-title">{t('localSpaceHud.title')}</span>
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
          aria-label={t('localSpaceHud.closeAria')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
      </div>

      <div className="location-ls">
        {/* Origin: where the lines radiate from. Segmented (two options) rather than a
            dropdown — fits the narrow HUD and reads at a glance. */}
        <div className="location-ls-seg" role="group">
          {(['pin', 'birthplace'] as const).map((o) => (
            <LsTipButton
              key={o}
              className={`location-ls-seg-btn location-ls-seg-${o} ${lsOrigin === o ? 'active' : ''}`}
              onClick={() => setLsOrigin(o)}
              ariaPressed={lsOrigin === o}
              title={t(`localSpaceHud.lsOrigin.${o}`)}
              hint={t(`localSpaceHud.lsOrigin.${o}Hint`)}
            >
              {o === 'pin' ? (
                <PinOriginLabel label={t('localSpaceHud.lsOrigin.pin')} />
              ) : (
                t(`localSpaceHud.lsOrigin.${o}`)
              )}
            </LsTipButton>
          ))}
        </div>
        <LsTipButton
          className={`location-ls-toggle ${!hideLsInbound ? 'on' : 'off'}`}
          onClick={() => setHideLsInbound(!hideLsInbound)}
          ariaPressed={hideLsInbound}
          title={t('localSpaceHud.hideInbound.title')}
          hint={t('localSpaceHud.hideInbound.hint')}
        >
          <EyeIcon open={!hideLsInbound} />
          <span className="location-ls-name">{t('localSpaceHud.hideInbound.title')}</span>
        </LsTipButton>
        <LsTipButton
          className={`location-ls-toggle ${!hideLsCompass ? 'on' : 'off'}`}
          onClick={() => setHideLsCompass(!hideLsCompass)}
          ariaPressed={hideLsCompass}
          title={t('localSpaceHud.hideCompass.title')}
          hint={t('localSpaceHud.hideCompass.hint')}
        >
          <EyeIcon open={!hideLsCompass} />
          <span className="location-ls-name">{t('localSpaceHud.hideCompass.title')}</span>
        </LsTipButton>
        <LsTipButton
          className="location-ls-fly"
          onClick={() => {
            if (localSpaceOrigin)
              onFlyTo(localSpaceOrigin.lat, localSpaceOrigin.lng, FLY_TO_ORIGIN_ZOOM);
          }}
          disabled={!localSpaceOrigin}
          title={t('localSpaceHud.flyToOrigin.title')}
          hint={t('localSpaceHud.flyToOrigin.hint')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="7" />
            <path d="M12 1v3" />
            <path d="M12 20v3" />
            <path d="M1 12h3" />
            <path d="M20 12h3" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
          </svg>
          <span>{t('localSpaceHud.flyToOrigin.title')}</span>
        </LsTipButton>
      </div>
    </div>
  );
}
