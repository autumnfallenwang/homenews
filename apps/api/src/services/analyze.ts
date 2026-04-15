import type { PipelineProgressEvent } from "@homenews/shared";
import { and, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { articleAnalysis, articles, feeds } from "../db/schema.js";
import { llmExecute } from "./llm-executor.js";
import { extractArticle } from "./reader.js";
import { getSetting } from "./settings.js";

interface AnalyzeOptions {
  onProgress?: (event: PipelineProgressEvent) => void | Promise<void>;
  /** Mutable cancel flag shared with the pipeline orchestrator. Checked
   *  before each LLM call; in-flight work always completes. */
  signal?: { cancelRequested: boolean };
}

/** Cutoff for which unanalyzed articles the pipeline will even look at.
 *  Historical backfill (OpenAI goes back to 2015) would otherwise monopolize
 *  the queue with rows that can never score well on freshness. Anything older
 *  is ignored by analyze — see Phase 8 / changelog 2026-04-13. */
const ANALYZE_MAX_AGE_DAYS = 14;

// ============================================================
// Slot allocation (Phase 10)
// ============================================================

/**
 * Per-feed input for `allocateSlots()`. `weight` is the feed's
 * `analyze_weight` (0-1), `pending` is the number of unanalyzed articles
 * currently in the 14-day window for that feed.
 */
export interface FeedAllocation {
  feedId: string;
  weight: number;
  pending: number;
}

/**
 * Distribute an analyze batch across feeds using weighted proportional
 * allocation with spillover. Returns a `Map<feedId, slotCount>` where
 * feeds that end up with zero slots are absent from the map.
 *
 * Properties:
 *  - Feeds with `weight === 0` are excluded entirely ("never analyze" —
 *    per-feed escape hatch independent of the `enabled` flag).
 *  - Feeds with `pending === 0` are excluded — nothing to allocate.
 *  - Ceiling rounding on fractional shares guarantees small-weight feeds
 *    with pending items get ≥1 slot rather than starving.
 *  - Each feed is capped at its `pending` count — no wasted slots.
 *  - Unused slots (from low-volume feeds hitting their pending ceiling)
 *    spill over into additional passes and get redistributed to feeds
 *    that still have capacity.
 *  - Typically converges in 2-3 passes for realistic inputs; bounded at
 *    10 passes as a safety net.
 *
 * See `docs/phase10-analyze-allocation-memo.md` for design rationale.
 */
export function allocateSlots(feeds: FeedAllocation[], totalSlots: number): Map<string, number> {
  const allocation = new Map<string, number>();
  if (totalSlots <= 0) return allocation;

  let eligible = feeds.filter((f) => f.weight > 0 && f.pending > 0);
  let remaining = totalSlots;
  const MAX_PASSES = 10;

  for (let pass = 0; pass < MAX_PASSES && remaining > 0 && eligible.length > 0; pass++) {
    // Snapshot remaining at the start of the pass so every feed competes
    // against the same denominator. Without this, later feeds in the
    // iteration would see a decremented remaining and get proportionally
    // smaller shares.
    const passRemaining = remaining;
    const totalWeight = eligible.reduce((s, f) => s + f.weight, 0);
    if (totalWeight === 0) break;

    const nextEligible: FeedAllocation[] = [];
    let allocatedThisPass = 0;

    for (const feed of eligible) {
      if (remaining <= 0) {
        // Budget exhausted mid-pass — carry remaining feeds unchanged so
        // they can try again if spillover gives us more slots.
        nextEligible.push(feed);
        continue;
      }
      const prev = allocation.get(feed.feedId) ?? 0;
      const proposed = Math.ceil((passRemaining * feed.weight) / totalWeight);
      const canTake = Math.min(proposed, feed.pending - prev, remaining);
      if (canTake > 0) {
        allocation.set(feed.feedId, prev + canTake);
        allocatedThisPass += canTake;
        remaining -= canTake;
        if (feed.pending > prev + canTake) {
          nextEligible.push(feed);
        }
      }
    }

    if (allocatedThisPass === 0) break;
    eligible = nextEligible;
  }

  return allocation;
}

// ============================================================
// Article-level helpers
// ============================================================

export interface AnalyzeResult {
  relevance: number;
  importance: number;
  tags: string[];
}

export function buildAnalyzePrompt(
  title: string,
  summary: string | null,
  content: string | null = null,
): string {
  let prompt = `Title: ${title}`;
  if (summary) {
    prompt += `\nSummary: ${summary}`;
  }
  if (content) {
    // Cap at 2000 chars — same budget as summarize. Full text rarely
    // improves tag classification beyond the first few paragraphs.
    prompt += `\nContent: ${content.slice(0, 2000)}`;
  }
  return prompt;
}

/**
 * Regex-based HTML → plain text conversion for LLM prompt input. Not
 * suitable for user-visible rendering — edge cases around nested tags,
 * CDATA, and comments are ignored. Good enough for feeding extracted
 * article content to analyze/summarize prompts where robustness to
 * whitespace noise is high.
 */
export function htmlToPlainText(html: string, maxChars: number): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function validateScore(value: unknown, field: string): number {
  if (typeof value !== "number" || value < 0 || value > 100) {
    throw new Error(`Invalid ${field}: ${value}`);
  }
  return Math.round(value);
}

export function parseAnalyzeResult(
  parsed: unknown,
  allowedTags: readonly string[],
  articleTitle?: string,
): AnalyzeResult {
  const obj = parsed as Record<string, unknown>;

  const relevance = validateScore(obj.relevance, "relevance");
  const importance = validateScore(obj.importance, "importance");

  const rawTags = Array.isArray(obj.tags) ? obj.tags.map(String) : [];
  const allowedSet = new Set(allowedTags);
  const tags: string[] = [];
  for (const tag of rawTags) {
    if (allowedSet.has(tag)) {
      tags.push(tag);
    } else {
      console.warn(
        `[analyze] Dropped unknown tag "${tag}"${articleTitle ? ` for article "${articleTitle}"` : ""}`,
      );
    }
  }

  return { relevance, importance, tags };
}

export async function analyzeArticle(
  title: string,
  summary: string | null,
  content: string | null = null,
): Promise<AnalyzeResult> {
  const prompt = buildAnalyzePrompt(title, summary, content);
  const result = await llmExecute("analyze", prompt);
  const allowedTags = await getSetting<string[]>("allowed_tags");
  return parseAnalyzeResult(result.parsed, allowedTags, title);
}

// ============================================================
// Extraction cascade (Phase 14 Task 71)
// ============================================================

/**
 * Ensure the article has extracted content stored in the DB and return a
 * plain-text preview for use in LLM prompts. Three-step cascade:
 *   1. Skip — if `extracted_content` is already populated, strip + return
 *   2. Copy — if RSS `content` has substantial text (≥500 chars), persist
 *      it verbatim with status='ok' and return stripped preview
 *   3. Fetch — call Readability via services/reader.ts; persist result or
 *      failure status, return plain text preview or null on failure
 *
 * Extraction failures are non-fatal: analyze continues with just
 * title + RSS summary. See phase14-capture-memo.md.
 */
const RSS_FULLTEXT_MIN = 500;
const PROMPT_PREVIEW_CHARS = 4000;

async function ensureExtracted(article: {
  id: string;
  link: string;
  content: string | null;
  extractedContent: string | null;
}): Promise<string | null> {
  // 1. Skip
  if (article.extractedContent) {
    return htmlToPlainText(article.extractedContent, PROMPT_PREVIEW_CHARS);
  }

  // 2. Copy from RSS when full-text ships in the feed (arXiv, most Substacks)
  if (article.content && article.content.length >= RSS_FULLTEXT_MIN) {
    await db
      .update(articles)
      .set({
        extractedContent: article.content,
        extractedAt: new Date(),
        extractionStatus: "ok",
      })
      .where(eq(articles.id, article.id));
    return htmlToPlainText(article.content, PROMPT_PREVIEW_CHARS);
  }

  // 3. Fetch via Readability
  const result = await extractArticle(article.link);
  if (result.ok) {
    await db
      .update(articles)
      .set({
        extractedContent: result.content,
        extractedAt: result.extractedAt,
        extractionStatus: "ok",
      })
      .where(eq(articles.id, article.id));
    return result.textContent.slice(0, PROMPT_PREVIEW_CHARS);
  }

  await db
    .update(articles)
    .set({
      extractedAt: result.extractedAt,
      extractionStatus: "failed",
    })
    .where(eq(articles.id, article.id));
  return null;
}

export async function analyzeUnanalyzed(
  limit?: number,
  options: AnalyzeOptions = {},
): Promise<{ analyzed: number; errors: number }> {
  const { onProgress, signal } = options;
  const effectiveLimit = limit && limit > 0 ? limit : 100;

  const cutoff = sql<Date>`NOW() - (${ANALYZE_MAX_AGE_DAYS} || ' days')::interval`;
  // Recency window: published_at within cutoff, OR (published_at NULL AND
  // fetched_at within cutoff). Same semantics as Phase 8.
  const inWindow = or(
    and(isNull(articles.publishedAt), gte(articles.fetchedAt, cutoff)),
    gte(articles.publishedAt, cutoff),
  );

  // ── Phase 1: count pending per feed (1 GROUP BY query) ──────────────
  // Filters: not duplicate, not analyzed, feed enabled, in 14-day window.
  // Note: `enabled = true` is a deliberate behavior change from Phase 8 —
  // disabling a feed now also stops analyze from grinding through its
  // existing in-window queue. See phase10-analyze-allocation-memo.md.
  const counts = await db
    .select({
      feedId: feeds.id,
      feedName: feeds.name,
      weight: feeds.analyzeWeight,
      pending: sql<number>`COUNT(*)`.as("pending"),
    })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .leftJoin(articleAnalysis, eq(articleAnalysis.articleId, articles.id))
    .where(
      and(
        isNull(articleAnalysis.id),
        isNull(articles.duplicateOfId),
        eq(feeds.enabled, true),
        inWindow,
      ),
    )
    .groupBy(feeds.id, feeds.name, feeds.analyzeWeight);

  // ── Phase 2: allocate slots ────────────────────────────────────────
  // Number() coerces the BIGINT count that postgres.js returns as string.
  const slots = allocateSlots(
    counts.map((c) => ({
      feedId: c.feedId,
      weight: c.weight,
      pending: Number(c.pending),
    })),
    effectiveLimit,
  );

  // Log allocation summary so we can see fairness at a glance per run.
  if (slots.size > 0) {
    const summary = counts
      .filter((c) => slots.has(c.feedId))
      .map((c) => `${c.feedName}=${slots.get(c.feedId)}/${Number(c.pending)}`)
      .join(" · ");
    console.info(`[analyze] allocation: ${summary}`);
  }

  // ── Phase 3: fetch articles per feed (per-feed buckets) ──────────
  // N small queries (N ≤ enabled feed count, typically ≤ 14). Each pulls
  // the newest unanalyzed articles up to that feed's allocated slot count.
  // Buckets are KEPT SEPARATE here so Phase 3.5 can round-robin them.
  type FetchedArticle = {
    id: string;
    title: string;
    summary: string | null;
    link: string;
    content: string | null;
    extractedContent: string | null;
    feedName: string;
  };
  const effectiveDate = sql<Date>`COALESCE(${articles.publishedAt}, ${articles.fetchedAt})`;

  // Order feeds for the round-robin by weight desc so high-weight feeds get
  // their first article emitted earlier in the iteration. Tied feeds keep
  // stable order from the original counts query.
  const orderedFeedIds = [...slots.keys()].sort((a, b) => {
    const wa = counts.find((c) => c.feedId === a)?.weight ?? 0;
    const wb = counts.find((c) => c.feedId === b)?.weight ?? 0;
    return wb - wa;
  });

  const buckets: FetchedArticle[][] = [];
  for (const feedId of orderedFeedIds) {
    const slotCount = slots.get(feedId) ?? 0;
    if (slotCount <= 0) continue;
    const rows = await db
      .select({
        id: articles.id,
        title: articles.title,
        summary: articles.summary,
        link: articles.link,
        content: articles.content,
        extractedContent: articles.extractedContent,
        feedName: feeds.name,
      })
      .from(articles)
      .innerJoin(feeds, eq(articles.feedId, feeds.id))
      .leftJoin(articleAnalysis, eq(articleAnalysis.articleId, articles.id))
      .where(
        and(
          eq(articles.feedId, feedId),
          isNull(articleAnalysis.id),
          isNull(articles.duplicateOfId),
          inWindow,
        ),
      )
      .orderBy(desc(effectiveDate))
      .limit(slotCount);
    if (rows.length > 0) buckets.push(rows);
  }

  // ── Phase 3.5: round-robin interleave across feeds ───────────────
  // Take one article from each bucket per round, repeat until all buckets
  // are drained. This guarantees that cancelling mid-run leaves every feed
  // with at least floor(processed / feedCount) articles analyzed instead
  // of starving low-priority feeds (which is what happened when we sorted
  // by freshness desc — arXiv's hyper-fresh timestamps clustered at the
  // top and lab feeds never got reached before cancel). Within each feed,
  // articles stay newest-first thanks to the per-feed query's ORDER BY.
  const all: FetchedArticle[] = [];
  let depth = 0;
  let stillFilling = true;
  while (stillFilling) {
    stillFilling = false;
    for (const bucket of buckets) {
      if (depth < bucket.length) {
        all.push(bucket[depth]);
        stillFilling = true;
      }
    }
    depth++;
  }

  // ── Phase 4: analyze loop ─────────────────────────────────────────
  const total = all.length;
  await onProgress?.({ type: "analyze-start", total });

  let analyzed = 0;
  let errors = 0;

  for (let i = 0; i < all.length; i++) {
    if (signal?.cancelRequested) break;
    const article = all[i];
    await onProgress?.({
      type: "analyze-item",
      index: i,
      total,
      title: article.title,
      feedName: article.feedName,
    });
    try {
      const contentPreview = await ensureExtracted(article);
      const result = await analyzeArticle(article.title, article.summary, contentPreview);
      await db.insert(articleAnalysis).values({
        articleId: article.id,
        relevance: result.relevance,
        importance: result.importance,
        tags: result.tags,
      });
      analyzed++;
    } catch (err) {
      console.warn(
        `[analyze] Failed for "${article.title}": ${err instanceof Error ? err.message : String(err)}`,
      );
      errors++;
    }
  }

  await onProgress?.({ type: "analyze-done", analyzed, errors });
  return { analyzed, errors };
}
