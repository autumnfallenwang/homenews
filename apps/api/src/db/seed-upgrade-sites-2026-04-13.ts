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
import { db } from "./index.js";
import { feeds } from "./schema.js";

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
  console.info("[migration] upgrade-sites 2026-04-13 — starting");
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
      console.info(`[migration]   ${u.name} → ${u.newName} (${u.url})`);
    } else {
      console.info(`[migration]   ${u.name} not found, skipping`);
    }
  }
  console.info("[migration] done");
  process.exit(0);
}

run().catch((err) => {
  console.error("[migration] failed:", err);
  process.exit(1);
});
