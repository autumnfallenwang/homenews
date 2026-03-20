---
name: update-progress
description: Update the progress doc after finishing work. Use when the user finishes a task, wants to sync progress, or says "update progress", "mark it done", or "what's the status now".
---

Update `docs/progress.md` to reflect the current state of the project.

## Rules

- `docs/progress.md` tracks **only**: task table, what's working, what's next
- Design decisions and architectural choices go in `docs/design-plan.md`
- Keep "What's Working" as a concise bullet list
- Keep "What's Next" to one line pointing at the next task

## Steps

1. Read `docs/progress.md` and `docs/design-plan.md` to understand current state.
2. Scan the codebase to determine what actually exists and works.
3. Compare what exists against the task list. For each task, determine:
   - **Done**: all files exist, tests pass, functionality is wired up
   - **Partial**: some files exist or placeholder code still in place
   - **Not started**: files don't exist yet
4. Update `docs/progress.md` with:
   - Accurate task status table across all phases
   - "What's Working" — concise bullet list of working functionality
   - "What's Next" — single line pointing to the next task
   - Correct test count
If $ARGUMENTS is provided, treat it as additional context about what was just completed (e.g. "finished task 3 RSS fetcher").

Only update `docs/progress.md`. Do NOT change any other files.
