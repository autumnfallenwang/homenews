# Changelog

Append-only log of hotfixes, small behavioral tweaks, and operational findings.
Newest entries on top. One line per change when possible — date, scope, what, why.

For phased feature work see [progress.md](progress.md). For recurring-pattern
corrections see [lessons.md](lessons.md).

## 2026-04-13

- **fix(analyze)**: `analyzeUnanalyzed` now orders by `COALESCE(published_at, fetched_at) DESC` and filters to the last 14 days. **Why**: the old query had no `ORDER BY`, so Postgres returned rows in insertion order and the analyze batches burned entirely on OpenAI Blog (935 rows) then Hugging Face (762 rows), never reaching arXiv / Ars / MIT / VentureBeat. DB snapshot before the fix showed 6/9 feeds with 0 analyzed articles; after the filter, the pending queue fans out across those feeds (arXiv cs.AI 615, cs.LG 333, cs.CL 233, Ars 23, MIT 9, OpenAI 2 remaining in-window). Cutoff lives as `ANALYZE_MAX_AGE_DAYS = 14` at the top of `analyze.ts`.
- **chore(admin)**: `/pipeline/fetch` and `/pipeline/run-all` now emit one `[admin] fetch:<feedName> added=N` info line per feed, plus a `[admin] fetch:<feedName> ERROR — <msg>` warn when a feed throws. **Why**: the aggregate `feeds=N added=M errors=K` line couldn't tell us which specific feed was silent or failing.
- **ops**: Checked Google AI Blog (`https://blog.google/technology/ai/rss/`) manually — URL serves a 302 redirect to `https://blog.google/innovation-and-ai/technology/ai/rss/`, curl -L returns 200 + 31KB XML, and a direct `rss-parser.parseURL` call from node succeeds (20 items returned). The in-server fetches have nevertheless been silently failing since feed seed (`last_fetched_at = NULL`, all 8 other feeds successfully fetched at 01:30 today). **Status**: pending. The per-feed fetch logging added above will surface the actual in-server error on the next `/pipeline/fetch` tick. Do not guess-fix before we have the log line.
