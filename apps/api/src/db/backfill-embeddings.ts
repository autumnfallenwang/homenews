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

  console.info(`[backfill-embeddings] articles: ${rows.length} rows to process`);

  let embedded = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if ((i + 1) % 10 === 0 || i === 0) {
      console.info(
        `[backfill-embeddings] (${i + 1}/${rows.length}) ${row.feedName}: ${row.title.slice(0, 60)}`,
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
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[backfill-embeddings] article ${row.id} failed: ${msg}`);
      failed++;
    }
  }

  const durationSec = Math.round((Date.now() - startedAt) / 1000);
  console.info(
    `[backfill-embeddings] articles done: embedded=${embedded} failed=${failed} duration=${durationSec}s`,
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

  console.info(`[backfill-embeddings] highlights: ${rows.length} rows to process`);

  let embedded = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if ((i + 1) % 10 === 0 || i === 0) {
      console.info(
        `[backfill-embeddings] (${i + 1}/${rows.length}) ${row.feedName}: ${row.articleTitle.slice(0, 40)}`,
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
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[backfill-embeddings] highlight ${row.id} failed: ${msg}`);
      failed++;
    }
  }

  const durationSec = Math.round((Date.now() - startedAt) / 1000);
  console.info(
    `[backfill-embeddings] highlights done: embedded=${embedded} failed=${failed} duration=${durationSec}s`,
  );
}

async function run() {
  await backfillArticles();
  await backfillHighlights();
  process.exit(0);
}

run().catch((err) => {
  console.error("[backfill-embeddings] fatal:", err);
  process.exit(1);
});
