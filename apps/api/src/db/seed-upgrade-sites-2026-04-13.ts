/**
 * Follow-up to seed-new-sources-2026-04-13.ts.
 *
 * The initial migration used Google News RSS with keyword queries
 * (`"anthropic" claude`, `"meta ai" OR "llama"`, `"mistral ai"`) which
 * returned mostly 3rd-party press coverage. Switching to `site:<domain>`
 * queries restricts results to first-party posts only (Anthropic's
 * engineering/research/news blog, Meta AI's research releases, Mistral's
 * own announcements). Much higher signal — these are effectively
 * first-party feeds now, so authority_score goes back up to 0.5 and the
 * category changes from `news-aggregator` to `lab-proxy`.
 *
 * Idempotent: updates by feed name.
 */
import { eq } from "drizzle-orm";
import { log } from "../lib/logger.js";
import { db } from "./index.js";
import { feeds } from "./schema.js";

const SCRIPT = "seed-upgrade-sites-2026-04-13";

// biome-ignore-start lint/security/noSecrets: Google News RSS URLs are public search endpoints
const upgrades: { name: string; newName: string; url: string }[] = [
  {
    name: "Anthropic (news)",
    newName: "Anthropic",
    url: "https://news.google.com/rss/search?q=site:anthropic.com&hl=en-US&gl=US&ceid=US:en",
  },
  {
    name: "Meta AI (news)",
    newName: "Meta AI",
    url: "https://news.google.com/rss/search?q=site:ai.meta.com&hl=en-US&gl=US&ceid=US:en",
  },
  {
    name: "Mistral AI (news)",
    newName: "Mistral AI",
    url: "https://news.google.com/rss/search?q=site:mistral.ai&hl=en-US&gl=US&ceid=US:en",
  },
];
// biome-ignore-end lint/security/noSecrets: Google News RSS URLs are public search endpoints

async function run() {
  log.info({ event: "migration.start", script: SCRIPT }, "migration starting");
  for (const u of upgrades) {
    const updated = await db
      .update(feeds)
      .set({
        name: u.newName,
        url: u.url,
        category: "lab-proxy",
        authorityScore: 0.5,
        lastFetchedAt: null, // force re-fetch against new URL
      })
      .where(eq(feeds.name, u.name))
      .returning({ id: feeds.id, name: feeds.name });
    if (updated.length > 0) {
      log.info(
        {
          event: "migration.feed.updated",
          script: SCRIPT,
          from: u.name,
          to: u.newName,
          url: u.url,
        },
        "feed renamed + URL updated",
      );
    } else {
      log.info(
        { event: "migration.feed.skipped", script: SCRIPT, from: u.name, reason: "not_found" },
        "feed row not found, skipping",
      );
    }
  }
  log.info({ event: "migration.done", script: SCRIPT }, "migration complete");
  process.exit(0);
}

run().catch((err) => {
  log.error({ event: "migration.failed", script: SCRIPT, err }, "migration failed");
  process.exit(1);
});
