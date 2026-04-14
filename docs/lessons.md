# Lessons Learned

Corrections and patterns discovered during development. Claude reads this at the start of each `/dev-task` to avoid repeating mistakes.

## How to use this file

- After any correction from the user, add an entry below
- Each entry: what went wrong, why, and what to do instead
- Remove entries that are no longer relevant (e.g., the code pattern was removed)

---

## Entries

- **Start narrow, not broad** — user prefers focused scope over wide nets. Don't over-expand source lists, feature sets, or abstractions beyond what the current task explicitly asks for. **Why**: came up during early feed seeding when I tried to add dozens of tangentially-relevant sources; user wanted AI/LLM-only and to validate the core loop first. **How to apply**: when tempted to "also add X while I'm here," don't. Ship the narrower thing, learn, then expand.
- **One score, one thing** — don't reuse a dimension (e.g. `authority_score`) to solve two different concerns (ranking AND allocation). Each concern gets its own field, even when their defaults look identical. Came up in Phase 10: I initially proposed reusing `authority_score` for analyze batch allocation; user corrected with "one score one thing"; added dedicated `analyze_weight` instead. Coupling two concerns to one knob makes tuning one of them break the other.
- **The API is the product; every client (including web) is just a consumer.** All functionality lives behind REST endpoints — no business logic in Next.js server actions or route handlers, no pre-formatted strings in responses (raw ISO timestamps + raw numbers only), no state in the web app that doesn't originate in a GET. Zod schemas stay in `@homenews/shared` so any future TS client reuses them. Auth will eventually land at the API layer, not the web. **Why**: the architecture is explicitly heading toward server-to-server consumers (CLI, future iOS, Claude-as-a-tool calling `/search`). Any logic that leaks into the web client has to be reimplemented for every new consumer. **How to apply**: when tempted to compute a field in a server component "just for the dashboard," add it to the API response instead; when tempted to format a date string server-side, return ISO and format in the client; when building a new feature, ship and validate the API endpoint first (curl / Postman) *before* touching any UI.
- **Don't use the freshness signal for iteration order** — freshness is the right signal for *ranking* (which articles the user sees) but wrong for *cancel-fairness* (which articles get processed first in a batch). In Phase 10 I sorted the analyze batch by `COALESCE(published_at, fetched_at) DESC` after fair allocation; arXiv's hyper-fresh timestamps clustered at the top, so cancelling mid-run starved lab feeds despite the allocator being correct. Fix was round-robin interleaving across feed buckets in Phase 10.1. **Rule**: if two concerns happen to share the same ordering signal, it's a smell — different concerns deserve different mechanisms even if the signals look similar.
