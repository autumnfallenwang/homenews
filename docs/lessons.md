# Lessons Learned

Corrections and patterns discovered during development. Claude reads this at the start of each `/dev-task` to avoid repeating mistakes.

## How to use this file

- After any correction from the user, add an entry below
- Each entry: what went wrong, why, and what to do instead
- Remove entries that are no longer relevant (e.g., the code pattern was removed)

---

## Entries

- **Use uv + pyproject.toml for Python, not global pip install** — user prefers proper project-scoped tooling. Always use `uv run` for Python scripts.
- **Start narrow, not broad** — user wants focused scope first (AI/LLM sources only), not a wide net. Don't over-expand source lists or features beyond what's asked.
- **One score, one thing** — don't reuse a dimension (e.g. `authority_score`) to solve two different concerns (ranking AND allocation). Each concern gets its own field, even when their defaults look identical. Came up in Phase 10: I initially proposed reusing `authority_score` for analyze batch allocation; user corrected with "one score one thing"; added dedicated `analyze_weight` instead. Coupling two concerns to one knob makes tuning one of them break the other.
- **Don't use the freshness signal for iteration order** — freshness is the right signal for *ranking* (which articles the user sees) but wrong for *cancel-fairness* (which articles get processed first in a batch). In Phase 10 I sorted the analyze batch by `COALESCE(published_at, fetched_at) DESC` after fair allocation; arXiv's hyper-fresh timestamps clustered at the top, so cancelling mid-run starved lab feeds despite the allocator being correct. Fix was round-robin interleaving across feed buckets in Phase 10.1. **Rule**: if two concerns happen to share the same ordering signal, it's a smell — different concerns deserve different mechanisms even if the signals look similar.
