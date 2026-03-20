---
name: test
description: Run test suites. Use when the user wants to run tests, check if tests pass, or says "test", "run tests", "does it work", "vitest", or "xctest". Covers both TypeScript (Vitest) and Swift (XCTest).
---

Run tests for the relevant platform(s). Show failures clearly with file and line numbers.

## Determine scope

- If $ARGUMENTS specifies a platform (e.g. "swift", "ios"), run only Swift tests.
- If $ARGUMENTS specifies "ts", "web", or "api", run only TypeScript tests.
- Otherwise, determine scope from the rest of the arguments.

## TypeScript (Vitest)

- No arguments: run fast tests only (`pnpm test:fast`)
- `--all` or `all`: run full suite (`pnpm test`)
- Any other arguments: pass through to vitest (`pnpm --filter @homenews/api exec vitest run $ARGUMENTS`)

## Swift (Testing framework)

Skip if `apps/ios/` doesn't exist or `which xcodebuild` fails. Note what's missing and continue.

- Run: `cd apps/ios/HomeNews.swiftpm && xcodebuild test -scheme HomeNews -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -quiet`

Report results from both platforms when running all.
