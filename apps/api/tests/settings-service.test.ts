import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  userId: string | null;
  key: string;
  value: string;
  valueType: string;
  description: string | null;
  updatedAt: Date;
};

let rows: Row[] = [];
const insertedValues: unknown[] = [];
const updatedValues: unknown[] = [];

vi.mock("../src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(rows),
      }),
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        insertedValues.push(vals);
        rows.push({
          id: `id-${rows.length}`,
          userId: (vals.userId as string | null) ?? null,
          key: vals.key as string,
          value: vals.value as string,
          valueType: vals.valueType as string,
          description: (vals.description as string | null) ?? null,
          updatedAt: new Date(),
        });
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => {
        updatedValues.push(vals);
        return { where: () => Promise.resolve() };
      },
    }),
    delete: () => ({
      where: () => ({ returning: () => Promise.resolve(rows.map((r) => ({ id: r.id }))) }),
    }),
  },
}));

import { getSetting, getSettingsBatch, setSetting } from "../src/services/settings.js";

beforeEach(() => {
  rows = [];
  insertedValues.length = 0;
  updatedValues.length = 0;
});

function mockRow(key: string, value: string, valueType: string, userId: string | null = null): Row {
  return {
    id: `id-${key}`,
    userId,
    key,
    value,
    valueType,
    description: null,
    updatedAt: new Date(),
  };
}

describe("getSetting", () => {
  it("parses number values", async () => {
    rows = [mockRow("test_num", "42.5", "number")];
    const v = await getSetting<number>("test_num");
    expect(v).toBe(42.5);
  });

  it("parses boolean values", async () => {
    rows = [mockRow("test_bool", "true", "boolean")];
    const v = await getSetting<boolean>("test_bool");
    expect(v).toBe(true);
  });

  it("parses false boolean", async () => {
    rows = [mockRow("test_bool", "false", "boolean")];
    const v = await getSetting<boolean>("test_bool");
    expect(v).toBe(false);
  });

  it("parses string values", async () => {
    rows = [mockRow("test_str", "hello", "string")];
    const v = await getSetting<string>("test_str");
    expect(v).toBe("hello");
  });

  it("parses json array values", async () => {
    rows = [mockRow("test_json", '["a","b","c"]', "json")];
    const v = await getSetting<string[]>("test_json");
    expect(v).toEqual(["a", "b", "c"]);
  });

  it("falls back to DEFAULT_SETTINGS when no DB row", async () => {
    rows = [];
    const v = await getSetting<number>("weight_relevance");
    expect(v).toBe(0.15);
  });

  it("prefers user-specific over null-user row", async () => {
    rows = [
      mockRow("weight_relevance", "0.15", "number", null),
      mockRow("weight_relevance", "0.99", "number", "user-1"),
    ];
    const v = await getSetting<number>("weight_relevance", "user-1");
    expect(v).toBe(0.99);
  });

  it("throws on unknown key with no fallback", async () => {
    rows = [];
    await expect(getSetting("nonexistent_key")).rejects.toThrow("Unknown setting key");
  });
});

describe("getSettingsBatch", () => {
  it("returns empty object for empty keys", async () => {
    const result = await getSettingsBatch([]);
    expect(result).toEqual({});
  });

  it("returns parsed values for multiple keys", async () => {
    rows = [
      mockRow("weight_relevance", "0.20", "number"),
      mockRow("weight_importance", "0.40", "number"),
    ];
    const result = await getSettingsBatch(["weight_relevance", "weight_importance"]);
    expect(result.weight_relevance).toBe(0.2);
    expect(result.weight_importance).toBe(0.4);
  });

  it("falls back to defaults for missing keys", async () => {
    rows = [];
    const result = await getSettingsBatch(["weight_relevance"]);
    expect(result.weight_relevance).toBe(0.15);
  });
});

describe("setSetting", () => {
  it("serializes number values to string", async () => {
    await setSetting("weight_relevance", 0.42);
    expect(insertedValues[0]).toMatchObject({
      key: "weight_relevance",
      value: "0.42",
      valueType: "number",
    });
  });

  it("serializes boolean values", async () => {
    await setSetting("scheduler_enabled", false);
    expect(insertedValues[0]).toMatchObject({
      value: "false",
      valueType: "boolean",
    });
  });

  it("serializes JSON values", async () => {
    await setSetting("allowed_tags", ["ai", "ml"]);
    expect(insertedValues[0]).toMatchObject({
      value: '["ai","ml"]',
      valueType: "json",
    });
  });

  it("infers type for unknown number key", async () => {
    await setSetting("custom_number", 123);
    expect(insertedValues[0]).toMatchObject({ valueType: "number" });
  });

  it("infers type for unknown string key", async () => {
    await setSetting("custom_str", "hello");
    expect(insertedValues[0]).toMatchObject({ valueType: "string" });
  });
});
