// Phase 15 Task 91 — one-shot backfill script for semantic embeddings.
//
// Walks articles (analyzed, embedding IS NULL) and highlights (embedding IS
// NULL), embeds each row via services/embed.ts, writes the vector back.
// Idempotent — the IS NULL filter naturally skips rows the script already
// wrote, so transient gateway failures self-heal on re-runs.
//
// Manual invocation:
//   pnpm --filter @homenews/api run db:backfill-embeddings
//
// Recommended order: run db:backfill-extraction FIRST so articles have
// their extracted_content populated, THEN run this. Embeddings generated
// over title + extracted_content are much richer than title alone.

import { and, desc, eq, isNull } from "drizzle-orm";
import { log } from "../lib/logger.js";
import { htmlToPlainText } from "../services/analyze.js";
import { embed } from "../services/embed.js";
import { db } from "./index.js";
import { articleAnalysis, articleHighlights, articles, feeds } from "./schema.js";

const EMBEDDING_INPUT_CHARS = 500;
const PREVIEW_EXTRACT_CHARS = 4000;

async function backfillArticles() {
  const startedAt = Date.now();

  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      extractedContent: articles.extractedContent,
      feedName: feeds.name,
    })
    .from(articles)
    .innerJoin(articleAnalysis, eq(articleAnalysis.articleId, articles.id))
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(and(isNull(articles.embedding)))
    .orderBy(desc(articleAnalysis.analyzedAt));

  log.info(
    { event: "backfill.embeddings.articles.start", to_process: rows.length },
    "backfill-embeddings articles starting",
  );

  let embedded = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if ((i + 1) % 10 === 0 || i === 0) {
      log.info(
        {
          event: "backfill.embeddings.articles.progress",
          index: i + 1,
          total: rows.length,
          feed_name: row.feedName,
          article_title: row.title,
        },
        "backfill-embeddings progress",
      );
    }

    // Mirror Task 89's ensureEmbedding input exactly so pipeline-embedded
    // and backfilled vectors come from identical text.
    const preview = row.extractedContent
      ? htmlToPlainText(row.extractedContent, PREVIEW_EXTRACT_CHARS)
      : null;
    const snippet = preview ? preview.slice(0, EMBEDDING_INPUT_CHARS) : "";
    const input = snippet ? `${row.title}\n${snippet}` : row.title;

    try {
      const vector = await embed(input);
      await db.update(articles).set({ embedding: vector }).where(eq(articles.id, row.id));
      embedded++;
    } catch (err) {
      log.warn(
        {
          event: "backfill.embeddings.article.failed",
          article_id: row.id,
          err: err instanceof Error ? err : new Error(String(err)),
        },
        "article embed failed during backfill",
      );
      failed++;
    }
  }

  const durationSec = Math.round((Date.now() - startedAt) / 1000);
  log.info(
    {
      event: "backfill.embeddings.articles.done",
      embedded,
      failed,
      duration_seconds: durationSec,
    },
    "backfill-embeddings articles complete",
  );
}

async function backfillHighlights() {
  const startedAt = Date.now();

  const rows = await db
    .select({
      id: articleHighlights.id,
      text: articleHighlights.text,
      articleTitle: articles.title,
      feedName: feeds.name,
    })
    .from(articleHighlights)
    .innerJoin(articles, eq(articleHighlights.articleId, articles.id))
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(isNull(articleHighlights.embedding))
    .orderBy(desc(articleHighlights.createdAt));

  log.info(
    { event: "backfill.embeddings.highlights.start", to_process: rows.length },
    "backfill-embeddings highlights starting",
  );

  let embedded = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if ((i + 1) % 10 === 0 || i === 0) {
      log.info(
        {
          event: "backfill.embeddings.highlights.progress",
          index: i + 1,
          total: rows.length,
          feed_name: row.feedName,
          article_title: row.articleTitle,
        },
        "backfill-embeddings highlights progress",
      );
    }

    try {
      const vector = await embed(row.text);
      await db
        .update(articleHighlights)
        .set({ embedding: vector })
        .where(eq(articleHighlights.id, row.id));
      embedded++;
    } catch (err) {
      log.warn(
        {
          event: "backfill.embeddings.highlight.failed",
          highlight_id: row.id,
          err: err instanceof Error ? err : new Error(String(err)),
        },
        "highlight embed failed during backfill",
      );
      failed++;
    }
  }

  const durationSec = Math.round((Date.now() - startedAt) / 1000);
  log.info(
    {
      event: "backfill.embeddings.highlights.done",
      embedded,
      failed,
      duration_seconds: durationSec,
    },
    "backfill-embeddings highlights complete",
  );
}

async function run() {
  await backfillArticles();
  await backfillHighlights();
  process.exit(0);
}

run().catch((err) => {
  log.error({ event: "backfill.embeddings.failed", err }, "backfill-embeddings fatal error");
  process.exit(1);
});
