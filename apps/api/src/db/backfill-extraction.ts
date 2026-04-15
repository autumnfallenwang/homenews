// Phase 14 Task 71b — one-shot backfill script for extracted_content.
//
// Walks articles that are analyzed (have an article_analysis row) but don't
// yet have extracted_content, and runs the same cascade as ensureExtracted()
// inside services/analyze.ts. Persists outcomes per-row. Idempotent — the
// `IS NULL` filter naturally skips rows the script already wrote.
//
// Manual invocation:
//   pnpm --filter @homenews/api run db:backfill-extraction
//   pnpm --filter @homenews/api run db:backfill-extraction -- --retry-failed
//
// --retry-failed also re-processes rows whose previous extraction attempt
// failed. Default skips them (broken URLs would otherwise get hammered on
// every run).

import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { extractArticle } from "../services/reader.js";
import { db } from "./index.js";
import { articleAnalysis, articles, feeds } from "./schema.js";

const RSS_FULLTEXT_MIN = 500;

async function run() {
  const retryFailed = process.argv.includes("--retry-failed");
  const startedAt = Date.now();

  const rows = await db
    .select({
      id: articles.id,
      link: articles.link,
      content: articles.content,
      title: articles.title,
      feedName: feeds.name,
    })
    .from(articles)
    .innerJoin(articleAnalysis, eq(articleAnalysis.articleId, articles.id))
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(
      and(
        isNull(articles.extractedContent),
        retryFailed
          ? sql`true`
          : or(isNull(articles.extractionStatus), ne(articles.extractionStatus, "failed")),
      ),
    );

  console.info(
    `[backfill-extraction] ${rows.length} rows to process${retryFailed ? " (including previously failed)" : ""}`,
  );

  let copied = 0;
  let fetched = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if ((i + 1) % 10 === 0 || i === 0) {
      console.info(
        `[backfill-extraction] (${i + 1}/${rows.length}) ${row.feedName}: ${row.title.slice(0, 60)}`,
      );
    }

    // 1. Copy from RSS when full-text ships in the feed
    if (row.content && row.content.length >= RSS_FULLTEXT_MIN) {
      await db
        .update(articles)
        .set({
          extractedContent: row.content,
          extractedAt: new Date(),
          extractionStatus: "ok",
        })
        .where(eq(articles.id, row.id));
      copied++;
      continue;
    }

    // 2. Fetch via Readability
    const result = await extractArticle(row.link);
    if (result.ok) {
      await db
        .update(articles)
        .set({
          extractedContent: result.content,
          extractedAt: result.extractedAt,
          extractionStatus: "ok",
        })
        .where(eq(articles.id, row.id));
      fetched++;
    } else {
      await db
        .update(articles)
        .set({
          extractedAt: result.extractedAt,
          extractionStatus: "failed",
        })
        .where(eq(articles.id, row.id));
      failed++;
    }
  }

  const durationSec = Math.round((Date.now() - startedAt) / 1000);
  console.info(
    `[backfill-extraction] done: copied=${copied} fetched=${fetched} failed=${failed} duration=${durationSec}s`,
  );
  process.exit(0);
}

run().catch((err) => {
  console.error("[backfill-extraction] failed:", err);
  process.exit(1);
});
