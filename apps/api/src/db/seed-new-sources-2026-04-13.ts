/**
 * One-off migration: new AI source coverage (2026-04-13).
 *
 * - Fix Google AI Blog URL to the canonical redirect target (stale URL was
 *   causing rss-parser to throw "Cannot read properties of null").
 * - Add 6 new feeds: 3 first-party labs + 3 Google News aggregator feeds
 *   covering labs that don't publish their own RSS (Anthropic, Meta AI,
 *   Mistral). xAI skipped — GNews results were mostly litigation drama.
 * - Disable VentureBeat AI (dead feed, newest article 2026-01-22).
 *
 * See docs/changelog.md — 2026-04-13.
 * Idempotent: uses onConflictDoNothing and eq-by-name for updates. Safe to
 * re-run.
 */
import { eq } from "drizzle-orm";
import { db } from "./index.js";
import { feeds } from "./schema.js";

// biome-ignore-start lint/security/noSecrets: Google News RSS URLs are public search endpoints, not secrets
const newFeeds = [
  // Tier 1 — first-party labs, higher authority
  {
    name: "DeepMind",
    url: "https://deepmind.google/blog/rss.xml",
    category: "lab",
    authorityScore: 0.6,
  },
  {
    name: "NVIDIA Developer",
    url: "https://developer.nvidia.com/blog/feed/",
    category: "lab",
    authorityScore: 0.6,
  },
  {
    name: "Microsoft Research",
    url: "https://www.microsoft.com/en-us/research/blog/feed/",
    category: "lab",
    authorityScore: 0.6,
  },
  // Tier 2 — Google News aggregator, lower authority (noisier, 3rd-party)
  {
    name: "Anthropic (news)",
    url: "https://news.google.com/rss/search?q=%22anthropic%22+claude&hl=en-US&gl=US&ceid=US:en",
    category: "news-aggregator",
    authorityScore: 0.3,
  },
  {
    name: "Meta AI (news)",
    url: "https://news.google.com/rss/search?q=%22meta+ai%22+OR+%22llama%22&hl=en-US&gl=US&ceid=US:en",
    category: "news-aggregator",
    authorityScore: 0.3,
  },
  {
    name: "Mistral AI (news)",
    url: "https://news.google.com/rss/search?q=%22mistral+ai%22&hl=en-US&gl=US&ceid=US:en",
    category: "news-aggregator",
    authorityScore: 0.3,
  },
];
// biome-ignore-end lint/security/noSecrets: Google News RSS URLs are public search endpoints, not secrets

async function run() {
  console.info("[migration] 2026-04-13 new sources — starting");

  // 1. Fix Google AI Blog URL
  const googleFix = await db
    .update(feeds)
    .set({
      url: "https://blog.google/innovation-and-ai/technology/ai/rss/",
      lastFetchedAt: null,
    })
    .where(eq(feeds.name, "Google AI Blog"))
    .returning({ id: feeds.id, url: feeds.url });
  if (googleFix.length > 0) {
    console.info(`[migration] Google AI Blog URL patched → ${googleFix[0].url}`);
  } else {
    console.info("[migration] Google AI Blog row not found, skipping URL patch");
  }

  // 2. Add new feeds (skip if URL already present)
  const inserted = await db
    .insert(feeds)
    .values(newFeeds)
    .onConflictDoNothing({ target: feeds.url })
    .returning({ id: feeds.id, name: feeds.name });
  console.info(`[migration] Inserted ${inserted.length}/${newFeeds.length} new feeds`);
  for (const f of inserted) {
    console.info(`[migration]   + ${f.name}`);
  }

  // 3. Disable VentureBeat AI (dead feed)
  const ventureDisable = await db
    .update(feeds)
    .set({ enabled: false })
    .where(eq(feeds.name, "VentureBeat AI"))
    .returning({ id: feeds.id, enabled: feeds.enabled });
  if (ventureDisable.length > 0) {
    console.info("[migration] VentureBeat AI disabled");
  } else {
    console.info("[migration] VentureBeat AI row not found, skipping disable");
  }

  console.info("[migration] done");
  process.exit(0);
}

run().catch((err) => {
  console.error("[migration] failed:", err);
  process.exit(1);
});
