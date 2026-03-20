---
name: lint
description: Run linters and show results. Use when the user wants to lint, fix formatting, or says "lint", "format", "fix style", "biome check", or "swiftlint". Covers both TypeScript (Biome) and Swift (SwiftLint).
---

Run linters for the relevant platform(s). Show issues clearly.

## Determine scope

- If $ARGUMENTS specifies a platform (e.g. "swift", "ios", "ts", "web", "api"), lint only that platform.
- If $ARGUMENTS is "fix", auto-fix all platforms.
- If no arguments, lint all platforms.

## TypeScript (Biome)

- Lint: `pnpm lint`
- Auto-fix: `pnpm lint:fix`

## Swift (SwiftLint)

Skip if `which swiftlint` fails (not installed) or `apps/ios/` doesn't exist. Note what's missing and continue.

- Lint: `cd apps/ios/HomeNews.swiftpm && swiftlint`
- Auto-fix: `cd apps/ios/HomeNews.swiftpm && swiftlint --fix`

Report results from both platforms. If one platform has no issues, say so briefly.
