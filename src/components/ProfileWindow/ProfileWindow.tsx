// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { TipButton } from '../ui/HoverTip';
import { useT } from '../../i18n';
import { getProfileSection } from '../../lib/extensions/profileSection';
import './ProfileWindow.css';

interface ProfileWindowProps {
  /** Advanced reading mode. The plan tag is its toggle: NEW off, ADV on. */
  advancedWheel: boolean;
  setAdvancedWheel: (v: boolean) => void;
}

// The permanent top-left profile strip. It hosts an optional identity element
// (avatar / username, supplied by a downstream build through the profile-section
// seam) followed by the plan tag. In the open core there is no identity, so the
// strip is just the tag; clicking it auto-flips Advanced reading mode. A gated
// build can swap the click for its own action (e.g. open a plan screen).
export function ProfileWindow({
  advancedWheel,
  setAdvancedWheel,
}: ProfileWindowProps) {
  const { t } = useT();
  const { renderIdentity, onPlanTag } = getProfileSection();
  const handlePlanTag = () =>
    onPlanTag
      ? onPlanTag({ advanced: advancedWheel, setAdvanced: setAdvancedWheel })
      : setAdvancedWheel(!advancedWheel);
  return (
    <div className="profile-window">
      {renderIdentity?.()}
      <TipButton
        type="button"
        className={`pw-plan-tag ${advancedWheel ? 'adv' : 'new'}`}
        onClick={handlePlanTag}
        role="switch"
        aria-checked={advancedWheel}
        placement="bottom"
        tip={t('profile.planTag.tip')}
        hint={t('profile.planTag.hint')}
      >
        {advancedWheel ? t('profile.planTag.adv') : t('profile.planTag.new')}
      </TipButton>
    </div>
  );
}
