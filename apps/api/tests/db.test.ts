import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  articleAnalysis,
  articleHighlights,
  articleInteractions,
  articles,
  feeds,
  pipelineRuns,
  settings,
} from "../src/db/schema.js";

describe("feeds table", () => {
  it("has correct table name", () => {
    expect(getTableName(feeds)).toBe("feeds");
  });

  it("has all expected columns", () => {
    const cols = getTableColumns(feeds);
    expect(Object.keys(cols).sort()).toEqual(
      [
        "id",
        "name",
        "url",
        "category",
        "enabled",
        "authorityScore",
        "analyzeWeight",
        "lastFetchedAt",
        "createdAt",
      ].sort(),
    );
  });

  it("has notNull on required columns", () => {
    const cols = getTableColumns(feeds);
    expect(cols.id.notNull).toBe(true);
    expect(cols.name.notNull).toBe(true);
    expect(cols.url.notNull).toBe(true);
    expect(cols.enabled.notNull).toBe(true);
    expect(cols.authorityScore.notNull).toBe(true);
    expect(cols.analyzeWeight.notNull).toBe(true);
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
        "duplicateOfId",
        "extractedContent",
        "extractedAt",
        "extractionStatus",
        "searchTsv",
        "embedding",
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
    expect(cols.duplicateOfId.notNull).toBe(false);
    expect(cols.extractedContent.notNull).toBe(false);
    expect(cols.extractedAt.notNull).toBe(false);
    expect(cols.extractionStatus.notNull).toBe(false);
  });
});

describe("article_analysis table", () => {
  it("has correct table name", () => {
    expect(getTableName(articleAnalysis)).toBe("article_analysis");
  });

  it("has all expected columns", () => {
    const cols = getTableColumns(articleAnalysis);
    expect(Object.keys(cols).sort()).toEqual(
      ["id", "articleId", "relevance", "importance", "tags", "llmSummary", "analyzedAt"].sort(),
    );
  });

  it("has notNull on required columns", () => {
    const cols = getTableColumns(articleAnalysis);
    expect(cols.id.notNull).toBe(true);
    expect(cols.articleId.notNull).toBe(true);
    expect(cols.relevance.notNull).toBe(true);
    expect(cols.importance.notNull).toBe(true);
    expect(cols.analyzedAt.notNull).toBe(true);
  });

  it("allows null on optional columns", () => {
    const cols = getTableColumns(articleAnalysis);
    expect(cols.tags.notNull).toBe(false);
    expect(cols.llmSummary.notNull).toBe(false);
  });
});

describe("article_interactions table", () => {
  it("has correct table name", () => {
    expect(getTableName(articleInteractions)).toBe("article_interactions");
  });

  it("has all expected columns", () => {
    const cols = getTableColumns(articleInteractions);
    expect(Object.keys(cols).sort()).toEqual(
      [
        "id",
        "articleId",
        "userId",
        "viewedAt",
        "readAt",
        "starred",
        "note",
        "userTags",
        "followUp",
        "readingSeconds",
        "createdAt",
        "updatedAt",
      ].sort(),
    );
  });

  it("has notNull on required columns", () => {
    const cols = getTableColumns(articleInteractions);
    expect(cols.id.notNull).toBe(true);
    expect(cols.articleId.notNull).toBe(true);
    expect(cols.starred.notNull).toBe(true);
    expect(cols.userTags.notNull).toBe(true);
    expect(cols.followUp.notNull).toBe(true);
    expect(cols.createdAt.notNull).toBe(true);
    expect(cols.updatedAt.notNull).toBe(true);
  });

  it("allows null on optional columns", () => {
    const cols = getTableColumns(articleInteractions);
    expect(cols.userId.notNull).toBe(false);
    expect(cols.viewedAt.notNull).toBe(false);
    expect(cols.readAt.notNull).toBe(false);
    expect(cols.note.notNull).toBe(false);
    expect(cols.readingSeconds.notNull).toBe(false);
  });
});

describe("article_highlights table", () => {
  it("has correct table name", () => {
    expect(getTableName(articleHighlights)).toBe("article_highlights");
  });

  it("has all expected columns", () => {
    const cols = getTableColumns(articleHighlights);
    expect(Object.keys(cols).sort()).toEqual(
      [
        "id",
        "articleId",
        "userId",
        "text",
        "note",
        "charStart",
        "charEnd",
        "createdAt",
        "embedding",
      ].sort(),
    );
  });

  it("has notNull on required columns", () => {
    const cols = getTableColumns(articleHighlights);
    expect(cols.id.notNull).toBe(true);
    expect(cols.articleId.notNull).toBe(true);
    expect(cols.text.notNull).toBe(true);
    expect(cols.createdAt.notNull).toBe(true);
  });

  it("allows null on optional columns", () => {
    const cols = getTableColumns(articleHighlights);
    expect(cols.userId.notNull).toBe(false);
    expect(cols.note.notNull).toBe(false);
    expect(cols.charStart.notNull).toBe(false);
    expect(cols.charEnd.notNull).toBe(false);
  });
});

describe("settings table", () => {
  it("has correct table name", () => {
    expect(getTableName(settings)).toBe("settings");
  });

  it("has all expected columns", () => {
    const cols = getTableColumns(settings);
    expect(Object.keys(cols).sort()).toEqual(
      ["id", "userId", "key", "value", "valueType", "description", "updatedAt"].sort(),
    );
  });

  it("has notNull on required columns", () => {
    const cols = getTableColumns(settings);
    expect(cols.id.notNull).toBe(true);
    expect(cols.key.notNull).toBe(true);
    expect(cols.value.notNull).toBe(true);
    expect(cols.valueType.notNull).toBe(true);
    expect(cols.updatedAt.notNull).toBe(true);
  });

  it("allows null on userId (multi-user forward-compat)", () => {
    const cols = getTableColumns(settings);
    expect(cols.userId.notNull).toBe(false);
    expect(cols.description.notNull).toBe(false);
  });
});

describe("pipeline_runs table", () => {
  it("has correct table name", () => {
    expect(getTableName(pipelineRuns)).toBe("pipeline_runs");
  });

  it("has all expected columns", () => {
    const cols = getTableColumns(pipelineRuns);
    expect(Object.keys(cols).sort()).toEqual(
      [
        "id",
        "trigger",
        "status",
        "startedAt",
        "endedAt",
        "durationMs",
        "fetchAdded",
        "fetchErrors",
        "analyzeAnalyzed",
        "analyzeErrors",
        "summarizeSummarized",
        "summarizeErrors",
        "errorMessage",
      ].sort(),
    );
  });

  it("has notNull on required columns", () => {
    const cols = getTableColumns(pipelineRuns);
    expect(cols.id.notNull).toBe(true);
    expect(cols.trigger.notNull).toBe(true);
    expect(cols.status.notNull).toBe(true);
    expect(cols.startedAt.notNull).toBe(true);
  });

  it("allows null on end-of-run columns", () => {
    const cols = getTableColumns(pipelineRuns);
    expect(cols.endedAt.notNull).toBe(false);
    expect(cols.durationMs.notNull).toBe(false);
    expect(cols.fetchAdded.notNull).toBe(false);
    expect(cols.fetchErrors.notNull).toBe(false);
    expect(cols.analyzeAnalyzed.notNull).toBe(false);
    expect(cols.analyzeErrors.notNull).toBe(false);
    expect(cols.summarizeSummarized.notNull).toBe(false);
    expect(cols.summarizeErrors.notNull).toBe(false);
    expect(cols.errorMessage.notNull).toBe(false);
  });
});
