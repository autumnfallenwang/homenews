import type Parser from "rss-parser";
import { describe, expect, it } from "vitest";
import { mapRssItem } from "../src/services/rss-mapper.js";

const FEED_ID = "00000000-0000-0000-0000-000000000001";

describe("mapRssItem", () => {
  it("maps a full RSS item to article insert shape", () => {
    const item: Parser.Item = {
      title: "AI Breakthrough",
      link: "https://example.com/article-1",
      guid: "guid-1",
      content: "<p>Full content here</p>",
      contentSnippet: "Full content here",
      creator: "Jane Doe",
      isoDate: "2026-04-07T12:00:00.000Z",
      pubDate: "Mon, 07 Apr 2026 12:00:00 GMT",
    };

    const result = mapRssItem(FEED_ID, item);

    expect(result).toEqual({
      feedId: FEED_ID,
      title: "AI Breakthrough",
      link: "https://example.com/article-1",
      summary: "Full content here",
      content: "<p>Full content here</p>",
      author: "Jane Doe",
      publishedAt: new Date("2026-04-07T12:00:00.000Z"),
    });
  });

  it("handles missing optional fields", () => {
    const item: Parser.Item = {
      title: "Minimal Item",
      link: "https://example.com/minimal",
    };

    const result = mapRssItem(FEED_ID, item);

    expect(result.title).toBe("Minimal Item");
    expect(result.link).toBe("https://example.com/minimal");
    expect(result.summary).toBeNull();
    expect(result.content).toBeNull();
    expect(result.author).toBeNull();
    expect(result.publishedAt).toBeNull();
  });

  it("uses guid as link fallback when link is missing", () => {
    const item: Parser.Item = {
      title: "No Link",
      guid: "https://example.com/guid-fallback",
    };

    const result = mapRssItem(FEED_ID, item);
    expect(result.link).toBe("https://example.com/guid-fallback");
  });

  it("defaults title to (untitled) when missing", () => {
    const item: Parser.Item = {
      link: "https://example.com/no-title",
    };

    const result = mapRssItem(FEED_ID, item);
    expect(result.title).toBe("(untitled)");
  });

  it("returns empty link when both link and guid are missing", () => {
    const item: Parser.Item = {
      title: "No Link At All",
    };

    const result = mapRssItem(FEED_ID, item);
    expect(result.link).toBe("");
  });

  it("parses isoDate into a Date object", () => {
    const item: Parser.Item = {
      title: "Date Test",
      link: "https://example.com/date",
      isoDate: "2026-01-15T08:30:00.000Z",
    };

    const result = mapRssItem(FEED_ID, item);
    expect(result.publishedAt).toBeInstanceOf(Date);
    expect(result.publishedAt?.toISOString()).toBe("2026-01-15T08:30:00.000Z");
  });
});
