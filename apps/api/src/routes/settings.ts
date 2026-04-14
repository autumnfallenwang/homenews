import { DEFAULT_SETTINGS, updateSettingSchema } from "@homenews/shared";
import { Hono } from "hono";
import { applyScheduleFromSettings } from "../services/scheduler.js";
import { getSetting, listSettings, resetSettings, setSetting } from "../services/settings.js";

const app = new Hono();

// List all settings (merged: user overrides + system defaults)
app.get("/", async (c) => {
  const settings = await listSettings();

  // Ensure keys defined in DEFAULT_SETTINGS appear even if not yet seeded
  const byKey = new Map(settings.map((s) => [s.key, s]));
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: "",
        userId: null,
        key,
        value: def.value,
        valueType: def.type,
        description: def.description,
        updatedAt: new Date(0).toISOString(),
      });
    }
  }

  return c.json(Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key)));
});

// Get a single setting by key
app.get("/:key", async (c) => {
  const key = c.req.param("key");
  try {
    const value = await getSetting(key);
    const def = DEFAULT_SETTINGS[key];
    return c.json({
      key,
      value,
      valueType: def?.type,
      description: def?.description ?? null,
    });
  } catch (_err) {
    return c.json({ error: `Unknown setting key: ${key}` }, 404);
  }
});

// Update a setting
app.patch("/:key", async (c) => {
  const key = c.req.param("key");
  const body = await c.req.json();
  const parsed = updateSettingSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", issues: parsed.error.issues }, 400);
  }

  try {
    await setSetting(key, parsed.data.value, undefined, parsed.data.description);
    const value = await getSetting(key);
    const def = DEFAULT_SETTINGS[key];

    // Hot-reload the cron task when the schedule expression changes.
    // scheduler_enabled is already read per-tick, so no restart needed there.
    if (key === "fetch_interval") {
      try {
        await applyScheduleFromSettings();
      } catch (err) {
        console.warn(
          `[settings] Failed to hot-reload scheduler: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return c.json({
      key,
      value,
      valueType: def?.type,
      description: def?.description ?? parsed.data.description ?? null,
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Failed to update setting" }, 400);
  }
});

// Reset all system defaults (dev convenience)
app.post("/reset", async (c) => {
  const result = await resetSettings();
  return c.json({ reset: result.reset });
});

export default app;
