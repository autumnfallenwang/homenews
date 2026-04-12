# UI Design Memo — Phase 7 Redesign

Status: **active design** for Phase 7 (UI redesign + settings consolidation).
This memo captures aesthetic direction, architectural decisions, and the task
breakdown for tasks 32–36.

---

## Aesthetic direction: "Newsroom Workstation"

HomeNews is a personal information tool, not a content site. The user lives
in this app for hours. It should feel like a workstation — dense, professional,
slightly serious — while still being beautiful.

**Reference points (NOT copies):**
- Bloomberg Terminal — information density, amber accent on dark, monospace
  numerics
- Editorial newsletters (The Browser, Read Max, Stratechery) — restraint
- GitHub Actions — compact control surfaces, status pills
- Hypercard / classic tools — hairline borders, sharp corners

### Concrete commitments

| Element | Choice |
|---------|--------|
| Theme | Dark by default. Warm near-black, not cold blue-black. |
| Display font | **Fraunces** (variable serif, optical sizing, character) |
| Body font | **Geist** (refined modern sans) |
| Numeric / labels | **Geist Mono** (data, scores, timestamps, technical labels) |
| Accent | Warm amber `oklch(0.78 0.16 65)` — single hot color, used sparingly |
| Borders | 1px hairlines, 4px max corner radius |
| Spacing scale | Tight: 4 / 8 / 12 / 16 / 24 / 32 |
| Decoration | Mono section labels in tracked uppercase, status dots, hairline dividers |

### The one memorable thing
The **pipeline control bar** at the top of the dashboard. Not a row of generic
buttons — a "control surface" with status pulse, mono labels, segmented
hairline-divided actions, and a primary CTA on the right.

---

## Architectural decisions

### 1. Theme stored in settings DB

A new `theme` setting joins the existing settings table:
- `key: "theme"`
- `valueType: "string"`
- `value: "dark" | "light" | "system"`
- `default: "dark"`

**Why DB-backed:** consistent with everything else tunable (weights, λ, etc.).
Future multi-user just adds the existing forward-compat user_id column.

**Why not cookie/localStorage primary:** the settings UI already manages every
other tunable; theme should live in the same place for one source of truth.

**Hydration flow:**
1. Server reads `theme` from DB on first request, sets HTML class accordingly
2. Client component subscribes to theme changes and updates the class on save
3. `system` mode adds a `prefers-color-scheme` media listener
4. To avoid first-paint flash, the server reads the cookie (if set) or
   defaults to `dark`. The DB write also updates the cookie for the next
   request.

**Migration path:** add `theme` to `DEFAULT_SETTINGS`, add a Theme tab in the
settings sidebar, ship a small `<ThemeApplier>` client component in the root
layout that reads the current value and reacts to changes.

### 2. Pipeline control moves from /settings to /

The "Run now" buttons (Fetch / Analyze / Summarize / Run All) belong on the
dashboard, not buried in settings. Settings is configuration; the dashboard
is operations.

**New location:** full-width strip at the top of the dashboard, above the
stats cards. Component: `apps/web/src/app/pipeline-control.tsx` (already
created).

**Removed from:** the settings page. Settings sidebar has no "Pipeline
control" section.

### 3. Feeds management folded into settings

The Feeds page becomes a tab inside `/settings`, not a separate top-level
route. Top nav loses the "Feeds" link.

**Why:** feeds management is configuration (which sources do you trust, what
authority, manual fetch). It belongs in settings alongside scheduler config
and tag vocabulary.

**Migration path:**
- Add a "Feeds" tab to the settings sidebar (last tab — it has the heaviest
  UI and logically reads as "advanced source config")
- Render the existing `<FeedList>` component inside the Feeds tab with
  minimal restyling
- Delete `/feeds/page.tsx` and `/feeds/feed-list.tsx` (move FeedList into
  the settings folder)
- Top nav: drop the "Feeds" link
- For backward compat with shareable links, add a redirect from `/feeds` →
  `/settings?tab=feeds`

### 4. Tabbed settings layout with explicit save/cancel

Replace the current single-column form with a sidebar-tab layout (GitHub
repo settings inspiration).

**Structure:**
- Left sidebar (~240px): vertical nav of section labels with two-digit mono
  prefixes (`01 Scoring`, `02 Freshness`, ...)
- Right pane: form for the active section
- Bottom of right pane: sticky footer with **Cancel** and **Save changes**
  buttons that appear when the section has unsaved changes
- Active tab: amber left border, slight bg tint
- Dirty tab indicator: small amber dot to the right of the label
- Switching tabs with unsaved changes opens a confirm dialog

**Sections (in order):**
1. Scoring — 5 weight inputs
2. Freshness — λ
3. Scheduler — enable toggles, cron, batch sizes
4. LLM models — analyze + summarize, primary + fallback
5. Tag vocabulary — chip list (immediate save, no save/cancel)
6. Theme — light / dark / system selector
7. Feeds — full feed management table

**Dirty tracking model:**
```ts
const [savedValues, setSavedValues] = useState<Record<string, unknown>>({});
const [localValues, setLocalValues] = useState<Record<string, unknown>>({});
// dirty when localValues[k] !== savedValues[k]
// save: PATCH all dirty in active tab, merge into savedValues
// cancel: drop localValues entries for active tab keys
```

**Per-tab vs global save:** per-tab. Save on Scoring tab only PATCHes the
weight keys, not Scheduler keys. Matches GitHub pattern.

**Tag vocabulary exception:** chip add/remove saves immediately. No dirty
state. The interaction model is different from forms (action vs edit).

### 5. Settings URL state

`/settings` defaults to the first tab. `?tab=scoring` (or any section id)
lets you deep-link to a specific tab. The active tab is read from the URL
and updated when the user switches tabs (via `useRouter().replace()` so
back-button doesn't pollute history).

This makes the `/feeds → /settings?tab=feeds` redirect from decision #3
work cleanly.

---

## Open questions and answers

| # | Question | Decision |
|---|----------|----------|
| 1 | Theme persistence: cookie vs localStorage primary? | DB primary, cookie is the SSR cache layer to avoid first-paint flash |
| 2 | How to handle `system` theme mode? | media query listener in client component, only active when theme=system |
| 3 | `/feeds` URL after move: 404 or redirect? | Redirect to `/settings?tab=feeds` |
| 4 | Settings URL state: ?tab=X in URL? | Yes, deep-linking + refresh persistence |
| 5 | Save scope: per-tab or global? | Per-tab |
| 6 | Tag vocabulary save model? | Immediate (no dirty tracking, no Save button) |
| 7 | Unsaved-changes warning: window.confirm or Dialog? | shadcn Dialog (polished) |

---

## Task breakdown (Phase 7)

| # | Task | Scope |
|---|------|-------|
| 32 | Foundation: theme tokens + fonts + nav | globals.css warm dark + amber, layout.tsx with Fraunces / Geist Mono / dark default, restyled top nav |
| 33 | Dashboard with pipeline control | PipelineControl component on `/`, restyled stats cards + article cards, article detail page consistency |
| 34 | Tabbed settings layout | Sidebar nav, dirty tracking, per-tab Save/Cancel, unsaved-changes Dialog, all 5 existing sections (Scoring, Freshness, Scheduler, LLM Models, Tag Vocabulary) |
| 35 | Theme setting | Add `theme` to DEFAULT_SETTINGS, ThemeApplier client component, Theme tab in settings sidebar, cookie hydration to prevent FOUC |
| 36 | Feeds in settings | Move FeedList component, add Feeds tab to sidebar, drop top-nav Feeds link, `/feeds → /settings?tab=feeds` redirect |

**Already partially done** (in this turn, before this memo was written):
- Task 32: globals.css + layout.tsx + pipeline-control.tsx are in place
- Task 33: pipeline-control.tsx component done; dashboard page integration not done

Tasks 34-36 are clean slate.

---

## Verification approach

For each task:
1. `pnpm lint` clean
2. `pnpm --filter @homenews/web build` clean
3. `pnpm test` all tests pass (no web tests added; API tests unaffected)
4. Manual visual check on dev server
