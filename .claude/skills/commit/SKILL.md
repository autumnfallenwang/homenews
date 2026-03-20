---
name: commit
description: Git commit with conventional format. Use when the user wants to commit, save progress, push changes, or says "commit", "save this", "push it", or "ship it".
---

## Step 1: Verify → `/check fast`

Run `/check fast`. Abort if anything fails.

## Step 2: Stage and commit

1. Stage changed files with `git add` (specific files, not -A)
2. Commit with message: `$ARGUMENTS`
3. Push to remote with `git push`

Message must use conventional commits: feat:, fix:, refactor:, docs:, test:, chore:

Append `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` to commit body.
