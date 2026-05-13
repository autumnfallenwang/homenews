# UI Shell Redesign

Locks the high-level UI shape that supersedes the Phase 7 newsroom-workstation
layout (top-nav, centered single column). The visual identity carries over —
warm-dark/amber palette, Fraunces display, Geist Mono for data, hairline
borders. Only the structural shell changes.

This memo is **design only** — no implementation details. Sequencing,
component choice, file paths, and migration steps land in a follow-up.

## Inspiration

- **Claude.ai** for the overall character — minimal chrome, no card outlines,
  hairline-separated sections, generous whitespace, content lives in headed
  groups rather than boxed cards.
- **VSCode sidebar** (e.g. the GitHub Actions / Source Control panels) for the
  contextual zone — vertically-stacked collapsible accordion sections,
  uppercase mono small-caps for section headers, scrollable when dense.

## The shell

One sidebar. One main content area. No global header. The sidebar's contents
swap by route — there is never a secondary side column.

The sidebar has **two shapes**, depending on what route is active:

### Shape A — top-level pages

`/dashboard`, `/search`, `/highlights`, `/pipeline`

```
┌──────────────────────┬────────────────────────────────────────────────┐
│ HOMENEWS             │                                                │
│                      │                                                │
│ ◐ Dashboard          │                                                │
│ ⌕ Search             │                                                │
│ ☆ Highlights         │                                                │
│ ⚡ Pipeline           │                                                │
│                      │                                                │
│ ─────                │           (page content scrolls here,          │
│ ▼ FILTERS            │            full width minus sidebar)           │
│   ▼ Sources          │                                                │
│     □ Verge          │                                                │
│     □ TechCrunch     │                                                │
│   ▶ Categories       │                                                │
│   ▼ Tags             │                                                │
│   ▶ Thresholds       │                                                │
│   ▶ Published        │                                                │
│   ▶ Sort             │                                                │
│                      │                                                │
│ ─────                │                                                │
│ ⚙ Settings           │                                                │
└──────────────────────┴────────────────────────────────────────────────┘
```

Three zones, top to bottom:

1. **Brand wordmark** — "HomeNews" in display type
2. **Primary nav** — the four top-level tabs, always visible while on a
   top-level page. The active tab is marked with a quiet selected state
   (subtle background tint, no heavy bar). Clicking another tab navigates
   without leaving Shape A — the contextual zone refills for the new page.
3. **Contextual zone** — page-specific content. On `/dashboard` this is the
   filter accordion (collapsible sections, scrollable when dense). On
   `/search` and `/highlights` it is empty for now (placeholder). On
   `/pipeline` it can host the run-history list.
4. **Footer** — a single `Settings` link, pinned to the bottom of the rail.
   Clicking it routes to `/settings` (no popup, no quick menu).

### Shape B — sub-pages

`/settings`, `/article/[id]`, and any future detail view.

```
┌──────────────────────┬────────────────────────────────────────────────┐
│ ← Back               │                                                │
│                      │                                                │
│ Scoring              │                                                │
│ Freshness            │                                                │
│ Scheduler            │                                                │
│ Models               │                                                │
│ Tag vocabulary       │            (page content scrolls here)         │
│ Theme                │                                                │
│ Feeds                │                                                │
│                      │                                                │
│                      │                                                │
│                      │                                                │
│                      │                                                │
└──────────────────────┴────────────────────────────────────────────────┘
```

The primary nav is gone. The whole sidebar is given over to the sub-page's
controls:

1. **Back** — a single row at the top. Returns to the previous top-level page
   (one level up the navigation stack).
2. **Sub-controls** — whatever the page needs. On `/settings` this is the
   list of settings sections (Scoring, Freshness, Scheduler, etc.). On
   `/article/[id]` it is **empty for now** — a deliberate placeholder so the
   shape stays uniform and future article-specific controls (table of
   contents, related articles, this article's highlights, etc.) have a slot
   to land in.

## Top-level tabs

| Tab | Purpose | Notes |
|---|---|---|
| Dashboard | Ranked articles feed | Current `/` page minus the pipeline control strip |
| Search | Keyword + fuzzy + semantic search | Placeholder for now — moves out of "what's already there" |
| Highlights | Cross-article highlights review | Placeholder for now |
| Pipeline | **New** — owns run trace + history | Lifted out of the dashboard so neither the dashboard nor the sidebar carry pipeline chrome. Holds the active run trace (SSE) + recent runs list + per-run drill-down |

The pipeline tab is the only **new** page. Search and Highlights already
exist; this redesign just relocates them to top-level tabs and removes any
inline chrome they share with the dashboard.

## Navigation rules

| From | Action | Result |
|---|---|---|
| Any top-level page | Click another top-level tab | Shape A persists; active tab + contextual zone swap |
| Any top-level page | Click `Settings` in footer | Routes to `/settings`; sidebar swaps to Shape B |
| Dashboard | Click an article card | Routes to `/article/[id]`; sidebar swaps to Shape B (empty controls) |
| Shape B page | Click `← Back` | Returns to the previous top-level page; sidebar swaps to Shape A |

Switching between top-level tabs is one click. Returning from a sub-page to a
top-level tab is one click (`Back`) plus optionally a second to switch tabs.

## Visual language

Carries over from Phase 7's newsroom-workstation direction unchanged:

- **Palette** — warm-dark background, amber accent, off-cream text, hairline
  borders at low opacity.
- **Type** — Fraunces for display (brand, page titles, quoted passages),
  Geist for body, Geist Mono for data and the uppercase small-caps section
  headers in the sidebar's contextual zone.
- **Borders** — hairline only (1px, low-opacity). **No card chrome anywhere**
  in the main content area; content sections are headed groups separated by
  whitespace + a faint divider, not boxed cards. This is the largest delta
  from Phase 7's current dashboard rows.
- **Selected states** — quiet (subtle background tint), never bold/colored
  bars.
- **Icons** — line-style, ~16px, low-emphasis.

## Page-by-page contextual zone

| Page | Sidebar shape | Contextual zone |
|---|---|---|
| `/dashboard` | A | Filter accordion: Sources, Categories, Tags, Thresholds, Published, Sort |
| `/search` | A | Empty (placeholder) |
| `/highlights` | A | Empty (placeholder) |
| `/pipeline` | A | Run history list (most-recent first), trigger filter, status filter |
| `/settings` | B | Settings sections: Scoring, Freshness, Scheduler, Models, Tag vocabulary, Theme, Feeds |
| `/article/[id]` | B | Empty (placeholder) |

## Cleanups this commits to

- Remove the `PipelineControl` strip from the dashboard page; pipeline lives
  only on `/pipeline`.
- Remove any sidebar-footer pipeline status proposals — same reason.
- Migrate the Phase 7 `/settings` sub-sidebar from a parallel column into the
  Shape B replacement pattern (same tabs, new chrome).
- Move the dashboard filter bar from inline-above-results into the sidebar's
  contextual zone, regrouped as collapsible accordion sections.
- Flatten the dashboard's article cards into hairline-separated rows (no
  rounded card outline) — the largest visual change in the main content
  area.

## Out of scope (deliberately)

- **Resizable sidebar** — fixed width for v1; can revisit if it earns its
  weight.
- **Mobile / narrow viewport** — desktop-first; mobile behavior is a separate
  problem to solve later.
- **Keyboard shortcuts** — out of scope here; command-palette / global
  shortcuts could land in a follow-up.
- **Search bar in the sidebar** — Claude.ai has one; homenews' search is a
  full page and the sidebar nav already exposes it. Skip.
- **User identity / floating menu** — no auth, no menu needed; `Settings` is
  the only thing in the footer.
- **Visual identity changes** — palette, type, and spacing scales all
  carry over from Phase 7 unchanged.
