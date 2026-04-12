import { DEFAULT_SETTINGS, type Setting, type SettingValueType } from "@homenews/shared";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { settings } from "../db/schema.js";

function serializeValue(value: unknown, type: SettingValueType): string {
  switch (type) {
    case "number":
      if (typeof value !== "number") throw new Error(`Expected number, got ${typeof value}`);
      return String(value);
    case "boolean":
      if (typeof value !== "boolean") throw new Error(`Expected boolean, got ${typeof value}`);
      return value ? "true" : "false";
    case "string":
      if (typeof value !== "string") throw new Error(`Expected string, got ${typeof value}`);
      return value;
    case "json":
      return JSON.stringify(value);
  }
}

function parseValue(value: string, type: SettingValueType): unknown {
  switch (type) {
    case "number":
      return Number.parseFloat(value);
    case "boolean":
      return value === "true";
    case "string":
      return value;
    case "json":
      return JSON.parse(value);
  }
}

function rowToSetting(row: typeof settings.$inferSelect): Setting {
  return {
    id: row.id,
    userId: row.userId,
    key: row.key,
    value: parseValue(row.value, row.valueType as SettingValueType),
    valueType: row.valueType as SettingValueType,
    description: row.description,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

/**
 * Get a single setting value with fallback.
 * Lookup order: (userId, key) → (NULL, key) → DEFAULT_SETTINGS[key].
 */
export async function getSetting<T = unknown>(key: string, userId?: string): Promise<T> {
  const rows = await db
    .select()
    .from(settings)
    .where(
      and(
        eq(settings.key, key),
        userId ? or(eq(settings.userId, userId), isNull(settings.userId)) : isNull(settings.userId),
      ),
    );

  // Prefer user-specific over NULL-user
  const userRow = userId ? rows.find((r) => r.userId === userId) : undefined;
  const defaultRow = rows.find((r) => r.userId === null);
  const row = userRow ?? defaultRow;

  if (row) {
    return parseValue(row.value, row.valueType as SettingValueType) as T;
  }

  // Fall back to code default
  const fallback = DEFAULT_SETTINGS[key];
  if (fallback) {
    return fallback.value as T;
  }

  throw new Error(`Unknown setting key: ${key}`);
}

/**
 * Get multiple settings in one query. Returns a map of key → parsed value.
 * Applies the same lookup order per key.
 */
export async function getSettingsBatch(
  keys: string[],
  userId?: string,
): Promise<Record<string, unknown>> {
  if (keys.length === 0) return {};

  const rows = await db
    .select()
    .from(settings)
    .where(
      and(
        inArray(settings.key, keys),
        userId ? or(eq(settings.userId, userId), isNull(settings.userId)) : isNull(settings.userId),
      ),
    );

  const result: Record<string, unknown> = {};

  for (const key of keys) {
    const userRow = userId ? rows.find((r) => r.key === key && r.userId === userId) : undefined;
    const defaultRow = rows.find((r) => r.key === key && r.userId === null);
    const row = userRow ?? defaultRow;

    if (row) {
      result[key] = parseValue(row.value, row.valueType as SettingValueType);
    } else {
      const fallback = DEFAULT_SETTINGS[key];
      if (fallback) {
        result[key] = fallback.value;
      }
    }
  }

  return result;
}

/**
 * Upsert a setting row. For single-user (current), userId is NULL.
 * For multi-user (future), pass the user's UUID.
 */
export async function setSetting(
  key: string,
  value: unknown,
  userId?: string,
  description?: string,
): Promise<void> {
  // Determine value type from DEFAULT_SETTINGS or infer from typeof
  const defaultDef = DEFAULT_SETTINGS[key];
  let valueType: SettingValueType;
  if (defaultDef) {
    valueType = defaultDef.type;
  } else {
    // Infer from runtime type (new settings not in DEFAULT_SETTINGS)
    if (typeof value === "number") valueType = "number";
    else if (typeof value === "boolean") valueType = "boolean";
    else if (typeof value === "string") valueType = "string";
    else valueType = "json";
  }

  const serialized = serializeValue(value, valueType);

  // Manual upsert: if a row exists for (userId, key), update it; otherwise insert
  const existing = await db
    .select({ id: settings.id })
    .from(settings)
    .where(
      and(eq(settings.key, key), userId ? eq(settings.userId, userId) : isNull(settings.userId)),
    );

  if (existing.length > 0) {
    await db
      .update(settings)
      .set({
        value: serialized,
        valueType,
        description: description ?? defaultDef?.description ?? null,
        updatedAt: new Date(),
      })
      .where(eq(settings.id, existing[0].id));
  } else {
    await db.insert(settings).values({
      userId: userId ?? null,
      key,
      value: serialized,
      valueType,
      description: description ?? defaultDef?.description ?? null,
    });
  }
}

/**
 * List all settings visible to a user: their overrides + system defaults,
 * deduplicated by key (user value wins).
 */
export async function listSettings(userId?: string): Promise<Setting[]> {
  const rows = await db
    .select()
    .from(settings)
    .where(
      userId ? or(eq(settings.userId, userId), isNull(settings.userId)) : isNull(settings.userId),
    );

  // Deduplicate: prefer user-specific rows over NULL-user rows
  const byKey = new Map<string, typeof settings.$inferSelect>();
  for (const row of rows) {
    const existing = byKey.get(row.key);
    if (!existing || (userId && row.userId === userId)) {
      byKey.set(row.key, row);
    }
  }

  return Array.from(byKey.values()).map(rowToSetting);
}

/**
 * Insert DEFAULT_SETTINGS rows with userId=NULL, skipping any that already exist.
 * Safe to call repeatedly.
 */
export async function seedDefaults(): Promise<{ seeded: number }> {
  let seeded = 0;
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    const existing = await db
      .select({ id: settings.id })
      .from(settings)
      .where(and(eq(settings.key, key), isNull(settings.userId)));

    if (existing.length === 0) {
      await db.insert(settings).values({
        userId: null,
        key,
        value: serializeValue(def.value, def.type),
        valueType: def.type,
        description: def.description,
      });
      seeded++;
    }
  }
  return { seeded };
}

/**
 * Reset a user's settings to defaults by deleting all their rows.
 * If userId is not provided, resets system defaults by re-seeding.
 */
export async function resetSettings(userId?: string): Promise<{ reset: number }> {
  if (userId) {
    const result = await db
      .delete(settings)
      .where(eq(settings.userId, userId))
      .returning({ id: settings.id });
    return { reset: result.length };
  }

  // Reset system defaults: delete NULL-user rows and re-seed
  const deleted = await db
    .delete(settings)
    .where(isNull(settings.userId))
    .returning({ id: settings.id });
  await seedDefaults();
  return { reset: deleted.length };
}

// Avoid unused import warning for sql
void sql;
