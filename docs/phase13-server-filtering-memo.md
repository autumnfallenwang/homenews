# Phase 13 — Server-side filtering for `/ranked`

Locked design memo. Replaces the current client-only filter (which filters a pre-fetched 50-row window) with a real server-driven query.

## Why this phase

Today the dashboard calls `GET /ranked?limit=50` once per page load and filters that window client-side. That means:

1. **Filters only narrow what's already on screen** — a user searching for "claude safety" sees only the matches that happen to be in the top-50-by-composite, not the real answer across all 487 analyzed rows.
2. **Pagination is invisible** — there's no way to page past row 50.
3. **Score thresholds are unreachable** — the composite/relevance/importance sliders would need client-side data that isn't fetched.
4. **Date ranges are impossible** — same reason.

Benchmarked query perf at 9.9ms unfiltered, 3.7ms filtered → server-side is free at current scale. No new indexes needed.

## Locked backend contract

Single endpoint, extended query params. All decisions below are **locked** (user explicitly accepted the full list on 2026-04-14).

### `GET /ranked`

```
?q=claude safety
&sources=Anthropic,DeepMind
&categories=lab
&tags=ai-safety,model-release
&composite_gte=60
&relevance_gte=70
&importance_gte=0
&published_at_gte=2026-04-08T00:00:00Z
&published_at_lte=2026-04-14T23:59:59Z
&sort=-relevance
&limit=50
&offset=0
&include_facets=1
```

### Response shape

```ts
{
  rows: AnalyzedArticle[],
  total: number,          // total matching the filters, not page size
  limit: number,          // echoed
  offset: number,         // echoed
  facets?: {              // only when ?include_facets=1
    sources:    { name: string; count: number }[],
    tags:       { name: string; count: number }[],
    categories: { name: string; count: number }[],
  }
}
```

**Breaking change**: current `/ranked` returns a bare array. New shape is wrapped. Web client + `fetchRanked()` helper must update in lockstep. No backwards-compat shim — rev the client at the same time.

### Locked decisions (the 13)

| # | Decision | Resolution |
|---|---|---|
| 1 | Tags filter semantics | **ANY** via `tags && ARRAY[...]` — matches article with any of the listed tags |
| 2 | Composite unit | **0-100** in the API (matches what the UI displays). Internal formula still normalizes to 0-1, multiplied by 100 at the response boundary |
| 3 | Response shape | **Wrapped** `{ rows, total, limit, offset, facets? }` |
| 4 | Sort whitelist | 6 fields only: `composite \| relevance \| importance \| freshness \| published \| analyzed`. Prefix `-` for desc. Default `-composite`. Fixed tiebreak: `analyzed_at DESC`. Anything else → 400 |
| 5 | Search scope | `title`, `article.summary`, `llm_summary` only. Case-insensitive substring (`ILIKE`). Empty string = no filter |
| 6 | Category filter | Exact string match on `feeds.category`. No normalization, no aliases |
| 7 | Limit / offset caps | `limit` 1-200 (default 50), `offset` 0-10000 (default 0). Out of range → 400 |
| 8 | Duplicate handling | Duplicates always excluded. No `?include_duplicates=1` param |
| 9 | Zod validation | Query params validated via Zod schema exported from `packages/shared`. Validation failure → 400 with `{ error, issues }` |
| 10 | Indexes | No new indexes at current scale. Revisit at 10k analyzed rows |
| 11 | Facets | Opt-in via `?include_facets=1`. Returns counts grouped by source / tag / category, computed against the **same filter set minus the facet's own dimension** (so clicking a source doesn't zero out the other source counts) |
| 12 | NULL date handling | Rows with `NULL published_at` are **excluded** by `published_at_gte` / `published_at_lte`. This is the default SQL behavior — no special-casing |
| 13 | Date format | Full ISO 8601 with timezone. `2026-04-08T00:00:00Z` valid, bare `2026-04-08` → 400 |

### Facet count semantics

Clicking `Anthropic` as a source filter should **not** zero out the count next to `DeepMind` (otherwise the UI becomes a one-way trip). Implementation: facet counts are computed with the filter for that dimension *removed*, so the user always sees "how many would match if I also added this chip."

Concretely:
- `facets.sources[i].count` = count matching (q + categories + tags + thresholds + date) — *excluding* the current sources filter
- `facets.tags[i].count` = same logic, excluding the current tags filter
- `facets.categories[i].count` = same, excluding the current categories filter

Three extra `SELECT count(*) GROUP BY` queries on the facets path. At ~5ms each this adds ~15ms when facets are requested. Dashboard only requests facets on initial load + after filter changes — not on every keystroke.

## Locked frontend UI direction

Decision on 2026-04-14: **keep the horizontal filter bar layout from the Phase 13 mockup ([phase13-filter-bar-mockup.html](phase13-filter-bar-mockup.html))**, but with **collapsible groups**. Rejected: left sidebar (eats ~260px of list width), modal (hides filter state).

### Default-open / default-collapsed

- **Always open**: Search, Sources, Sort
- **Collapsed by default**: Categories, Tags, Thresholds, Published date
- **Auto-expand on load**: any collapsed group that has an active value. Empty groups stay folded.

### Collapsed-group row treatment

A folded group renders as a thin ~32px row:

```
▸ TAGS       ——  2 active
▸ THRESHOLDS  ——  —
▸ PUBLISHED   ——  LAST 7D
```

- Disclosure triangle on the left (rotates 90° when expanded, no bounce)
- Row label in the same mono small-caps style as the expanded label (9.5px, 0.22em tracking)
- Active-state readout on the right: `N active` in amber if any chips are lit, `—` in muted if clean, or the filter's current value in compact form for single-value filters (date presets, slider mins)
- Whole row is clickable; hover tint matches chip hover

### Active filter count on the bar header

The filter bar gains a small header strip at the top with the total active-filter count and a `RESET ALL` affordance that was previously only in the sort row:

```
FILTERS · 6 ACTIVE                                   × RESET ALL
```

This keeps filter state legible even when every advanced group is folded.

### Future-proofing

When filter count grows past ~8 groups, the folded-horizontal-bar pattern starts to feel cramped vertically. At that point migrate to a left rail. This is mechanical — each group already self-contains its label + chips + state readout, so the rail migration is a layout change, not a logic change. **Don't pre-invest in the rail now.**

## Implementation tasks

See progress.md Phase 13 table. Task order is strict:

1. Shared Zod schema for the new query params + response shape
2. API query builder in `routes/ranked.ts` — filters, pagination, facets path
3. Web `fetchRanked()` helper update + new response type
4. Dashboard filter bar React component (collapsible groups, debounced search, URL state sync)
5. Facet rendering + count updates on filter change
6. E2E verification against a real database

## Out of scope for Phase 13

- Saved filter presets (bookmark-style)
- Filter state in URL shareable links beyond the existing `?tab=` pattern — Phase 13 syncs filters to URL params but stops there
- Full-text search ranking (ts_rank, pg_trgm) — plain ILIKE is fine at current corpus size
- Cluster filter (Phase 5 clustering was dropped)
- Filter-by-uniqueness (uniqueness score is hardcoded 1.0 for now)
- New indexes (revisit at 10k rows per decision #10)

## Migration / rollout

No feature flag. This is a breaking change to the `/ranked` response shape — API and web client must ship together. No third-party consumers. iOS app is skipped indefinitely, so no cross-platform concern.
