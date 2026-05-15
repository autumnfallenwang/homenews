// @sidebar/settings/page.tsx — Shape B contextual content for /settings.
//
// Renders the settings sub-tabs (Scoring / Freshness / Scheduler / Models /
// Tag Vocabulary / Theme / Feeds) into the AppSidebar's contextual zone.
// AppSidebar already renders the Back button at the top of Shape B, so this
// slot just contributes the tab list below it.
//
// Tab state lives in `?tab=` URL param (Phase 7 contract preserved). Active
// state is computed client-side via useSearchParams in SettingsTabsNav.

import { SettingsTabsNav } from "./settings-tabs";

export default function SettingsSidebar() {
  return <SettingsTabsNav />;
}
