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
