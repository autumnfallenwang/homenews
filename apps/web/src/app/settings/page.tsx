import type { Setting } from "@homenews/shared";
import { fetchSettings } from "@/lib/api";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  let settings: Setting[] = [];
  try {
    settings = await fetchSettings();
  } catch {
    // API unavailable — show empty state, form falls back to defaults
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <SettingsForm initialSettings={settings} />
    </main>
  );
}
