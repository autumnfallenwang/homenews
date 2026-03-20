---
name: check
description: Run lint + test + type-check in sequence. Use when the user wants to validate code, run all checks, verify everything passes, or says "check", "run checks", "does it pass", or "validate". Covers both TypeScript and Swift.
---

Run all checks and report results. Stop on first failure.

## Determine scope

- If $ARGUMENTS specifies a platform (e.g. "swift", "ios", "ts"), run checks for only that platform.
- If $ARGUMENTS is "fast" or "all", it controls test depth (passed to `/test`).
- If no arguments, default to fast tests across all platforms.

## TypeScript checks

1. Run `/lint`
2. `pnpm --filter @homenews/api exec tsc --noEmit`
3. Run `/test` — pass $ARGUMENTS through (e.g. `/check fast` → `/test fast`, `/check all` → `/test all`)

## Swift checks

Skip if `apps/ios/` doesn't exist or `which xcodebuild` fails (no Xcode). Note what's missing and continue with TS checks only.

1. Run `/lint swift`
2. Build check: `cd apps/ios/HomeNews.swiftpm && xcodebuild build -scheme HomeNews -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -quiet`
3. Run `/test swift` (if test target exists)

If no arguments provided, default to fast tests.
