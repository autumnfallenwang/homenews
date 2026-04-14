import { Hono } from "hono";
import { analyzeUnanalyzed } from "../services/analyze.js";
import { fetchAllFeeds } from "../services/feed-fetcher.js";
import { getSetting } from "../services/settings.js";
import { summarizeUnsummarized } from "../services/summarize.js";

const app = new Hono();

function ms(start: number): number {
  return Math.round(performance.now() - start);
}

function logFetchResults(results: Awaited<ReturnType<typeof fetchAllFeeds>>): void {
  // One line per feed so we can see exactly which ones are silent or failing.
  for (const r of results) {
    if (r.error) {
      console.warn(`[admin] fetch:${r.feedName} ERROR — ${r.error}`);
    } else {
      console.info(`[admin] fetch:${r.feedName} added=${r.added}`);
    }
  }
}

/** Manual trigger: fetch all enabled feeds. */
app.post("/pipeline/fetch", async (c) => {
  console.info("[admin] fetch start");
  const t = performance.now();
  const results = await fetchAllFeeds();
  logFetchResults(results);
  const added = results.reduce((sum, r) => sum + r.added, 0);
  const errors = results.filter((r) => r.error).length;
  console.info(
    `[admin] fetch done in ${ms(t)}ms — feeds=${results.length} added=${added} errors=${errors}`,
  );
  return c.json({
    feeds: results.length,
    added,
    errors,
    results,
  });
});

/** Manual trigger: analyze articles (relevance, importance, tags). */
app.post("/pipeline/analyze", async (c) => {
  const limitParam = c.req.query("limit");
  const limit =
    limitParam === undefined ? await getSetting<number>("analyze_batch_size") : Number(limitParam);
  console.info(`[admin] analyze start limit=${limit}`);
  const t = performance.now();
  const result = await analyzeUnanalyzed(limit);
  console.info(
    `[admin] analyze done in ${ms(t)}ms — analyzed=${result.analyzed} errors=${result.errors}`,
  );
  return c.json({ ...result, limit });
});

/** Manual trigger: summarize articles (LLM-generated summary). */
app.post("/pipeline/summarize", async (c) => {
  const limitParam = c.req.query("limit");
  const limit =
    limitParam === undefined
      ? await getSetting<number>("summarize_batch_size")
      : Number(limitParam);
  console.info(`[admin] summarize start limit=${limit}`);
  const t = performance.now();
  const result = await summarizeUnsummarized(limit);
  console.info(
    `[admin] summarize done in ${ms(t)}ms — summarized=${result.summarized} errors=${result.errors}`,
  );
  return c.json({ ...result, limit });
});

/** Manual trigger: run the full pipeline sequentially. */
app.post("/pipeline/run-all", async (c) => {
  const total = performance.now();
  console.info("[admin] run-all start");

  const tFetch = performance.now();
  const fetchResults = await fetchAllFeeds();
  logFetchResults(fetchResults);
  const added = fetchResults.reduce((sum, r) => sum + r.added, 0);
  const fetchErrors = fetchResults.filter((r) => r.error).length;
  console.info(
    `[admin] run-all:fetch done in ${ms(tFetch)}ms — feeds=${fetchResults.length} added=${added} errors=${fetchErrors}`,
  );

  const analyzeLimit = await getSetting<number>("analyze_batch_size");
  const tAnalyze = performance.now();
  const analyzeResult = await analyzeUnanalyzed(analyzeLimit);
  console.info(
    `[admin] run-all:analyze done in ${ms(tAnalyze)}ms — analyzed=${analyzeResult.analyzed} errors=${analyzeResult.errors} (limit=${analyzeLimit})`,
  );

  const summarizeLimit = await getSetting<number>("summarize_batch_size");
  const tSummarize = performance.now();
  const summarizeResult = await summarizeUnsummarized(summarizeLimit);
  console.info(
    `[admin] run-all:summarize done in ${ms(tSummarize)}ms — summarized=${summarizeResult.summarized} errors=${summarizeResult.errors} (limit=${summarizeLimit})`,
  );

  console.info(`[admin] run-all done in ${ms(total)}ms`);

  return c.json({
    fetch: {
      feeds: fetchResults.length,
      added,
      errors: fetchErrors,
    },
    analyze: { ...analyzeResult, limit: analyzeLimit },
    summarize: { ...summarizeResult, limit: summarizeLimit },
  });
});

export default app;
