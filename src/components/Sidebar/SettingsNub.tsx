// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useTouchLayout } from '../../lib/touch';
import './Sidebar.css';

// A small tab on the right edge (touch only) that opens the settings dock — a quick
// alternative to View ▸ Settings on a phone/tablet. The app renders it only while the
// dock is closed; it hides itself off touch.
export function SettingsNub({ onOpen }: { onOpen: () => void }) {
  const touch = useTouchLayout();
  if (!touch) return null;
  return (
    <button type="button" className="settings-nub" onClick={onOpen} aria-label="Open settings">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 7l-5 5 5 5" />
      </svg>
    </button>
  );
}
