import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { articles, feeds } from "../src/db/schema.js";

describe("feeds table", () => {
  it("has correct table name", () => {
    expect(getTableName(feeds)).toBe("feeds");
  });

  it("has all expected columns", () => {
    const cols = getTableColumns(feeds);
    expect(Object.keys(cols).sort()).toEqual(
      ["id", "name", "url", "category", "enabled", "lastFetchedAt", "createdAt"].sort(),
    );
  });

  it("has notNull on required columns", () => {
    const cols = getTableColumns(feeds);
    expect(cols.id.notNull).toBe(true);
    expect(cols.name.notNull).toBe(true);
    expect(cols.url.notNull).toBe(true);
    expect(cols.enabled.notNull).toBe(true);
    expect(cols.createdAt.notNull).toBe(true);
  });

  it("allows null on optional columns", () => {
    const cols = getTableColumns(feeds);
    expect(cols.category.notNull).toBe(false);
    expect(cols.lastFetchedAt.notNull).toBe(false);
  });
});

describe("articles table", () => {
  it("has correct table name", () => {
    expect(getTableName(articles)).toBe("articles");
  });

  it("has all expected columns", () => {
    const cols = getTableColumns(articles);
    expect(Object.keys(cols).sort()).toEqual(
      [
        "id",
        "feedId",
        "title",
        "link",
        "summary",
        "content",
        "author",
        "publishedAt",
        "fetchedAt",
      ].sort(),
    );
  });

  it("has notNull on required columns", () => {
    const cols = getTableColumns(articles);
    expect(cols.id.notNull).toBe(true);
    expect(cols.feedId.notNull).toBe(true);
    expect(cols.title.notNull).toBe(true);
    expect(cols.link.notNull).toBe(true);
    expect(cols.fetchedAt.notNull).toBe(true);
  });

  it("allows null on optional columns", () => {
    const cols = getTableColumns(articles);
    expect(cols.summary.notNull).toBe(false);
    expect(cols.content.notNull).toBe(false);
    expect(cols.author.notNull).toBe(false);
    expect(cols.publishedAt.notNull).toBe(false);
  });
});
