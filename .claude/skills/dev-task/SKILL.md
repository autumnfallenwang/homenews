---
name: dev-task
description: Plan and implement the next development task. Use when the user wants to build a feature, work on a task, implement something from the design plan, or says things like "let's work on task 7", "build the auth endpoint", "what's next", or "pick up the next task".
---

Pick up the next task from the development plan and implement it. The goal is to produce working, tested code — but the plan matters more than the code. A bad plan wastes tokens and time; a good plan makes implementation mechanical.

## Phase 1: Understand current state

1. Read `docs/progress.md` to see what's done, what's partial, what's next.
2. Read `docs/design-plan.md` for design decisions and architectural context.
3. Read `docs/lessons.md` for past corrections — avoid repeating known mistakes.
4. Identify the next task to work on — follow the dependency chain (earlier tasks must be done before later ones).
5. If $ARGUMENTS is provided, treat it as the specific task to work on (e.g. "task 5" or "feed ingestion") instead of auto-detecting.

## Phase 2: Explore and plan (the most important phase)

This phase is cheap in tokens and prevents expensive rework. Take your time here.

6. Read all source files relevant to the next task:
   - Files the task will create or modify
   - Files the task depends on (imports, types, existing patterns)
   - Existing test files to understand testing conventions
7. Determine which platform(s) this task targets:
   - **TypeScript** (tasks in apps/api, apps/web, packages/shared): check type definitions in `node_modules/` for library APIs (Hono, Drizzle, Zod).
   - **Swift** (tasks in apps/ios): read existing Swift files to understand patterns, check Apple framework docs if needed.
   - Some tasks may span both (e.g. API changes that affect iOS client).
8. Check the reference docs in `docs/` for any relevant specs.

### Plan Round 1 — Draft

9. Enter plan mode and write a detailed implementation plan:
   - Files to create/modify (with exact paths)
   - Types and interfaces to define
   - Functions to implement (with signatures and key logic)
   - Tests to write (with test names and what they verify)
   - Changes to existing files (imports, wiring)
   - Any risks or open questions

10. Present the plan to the user and **wait for feedback**. Explicitly ask: "Does this plan look right? Any changes before I proceed?"

### Plan Round 2 — Revise

11. Incorporate the user's feedback into the plan. If they had corrections, update the plan and present the revised version.
12. If the user approves (or says something like "go", "looks good", "do it"), proceed to Phase 3.
13. If the user has more feedback, revise again until they approve.

The point of two rounds: catching wrong assumptions before any code is written saves far more time than fixing bad code later.

## Phase 3: Implement

14. Exit plan mode and create/modify files according to the approved plan.
15. Run `/lint fix` to auto-fix formatting.

## Phase 4: Verify with recovery

16. Run `/check all`. For Swift-only tasks, run `/check swift` instead. For cross-platform tasks, run both.

If checks fail, follow this recovery strategy:

- **Lint failure** → run `/lint fix` and retry `/check all`
- **Type error** → read the error, fix the code, retry `/check all`
- **Test failure** → analyze the failure, fix the code or test, retry `/check all`

Retry up to **3 times total**. If still failing after 3 attempts:
- Stop and summarize what's failing and why
- Show the error output
- Ask the user how to proceed (fix manually, change approach, or skip)

Do not silently loop. Each retry should fix a different issue, not retry the same broken thing.

## Phase 5: Update progress

17. Run `/update-progress` to update docs with new task status.

## Phase 6: Record lessons (if applicable)

18. If the user corrected any assumptions during planning or implementation, add an entry to `docs/lessons.md` so the same mistake isn't repeated in future tasks.
