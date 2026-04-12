import { Hono } from "hono";
import { analyzeUnanalyzed } from "../services/analyze.js";
import { fetchAllFeeds } from "../services/feed-fetcher.js";
import { getSetting } from "../services/settings.js";
import { summarizeUnsummarized } from "../services/summarize.js";

const app = new Hono();

/** Manual trigger: fetch all enabled feeds. */
app.post("/pipeline/fetch", async (c) => {
  const results = await fetchAllFeeds();
  const added = results.reduce((sum, r) => sum + r.added, 0);
  const errors = results.filter((r) => r.error).length;
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
  const result = await analyzeUnanalyzed(limit);
  return c.json({ ...result, limit });
});

/** Manual trigger: summarize articles (LLM-generated summary). */
app.post("/pipeline/summarize", async (c) => {
  const limitParam = c.req.query("limit");
  const limit =
    limitParam === undefined
      ? await getSetting<number>("summarize_batch_size")
      : Number(limitParam);
  const result = await summarizeUnsummarized(limit);
  return c.json({ ...result, limit });
});

/** Manual trigger: run the full pipeline sequentially. */
app.post("/pipeline/run-all", async (c) => {
  const fetchResults = await fetchAllFeeds();

  const analyzeLimit = await getSetting<number>("analyze_batch_size");
  const analyzeResult = await analyzeUnanalyzed(analyzeLimit);

  const summarizeLimit = await getSetting<number>("summarize_batch_size");
  const summarizeResult = await summarizeUnsummarized(summarizeLimit);

  return c.json({
    fetch: {
      feeds: fetchResults.length,
      added: fetchResults.reduce((sum, r) => sum + r.added, 0),
      errors: fetchResults.filter((r) => r.error).length,
    },
    analyze: { ...analyzeResult, limit: analyzeLimit },
    summarize: { ...summarizeResult, limit: summarizeLimit },
  });
});

export default app;
