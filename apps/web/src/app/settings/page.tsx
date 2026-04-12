import type { Setting } from "@homenews/shared";
import { fetchSettings } from "@/lib/api";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  let settings: Setting[] = [];
  try {
    settings = await fetchSettings();
  } catch {
    // API unavailable — show empty state, form falls back to defaults
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <SettingsForm initialSettings={settings} initialTab={tab ?? "scoring"} />
    </main>
  );
}
