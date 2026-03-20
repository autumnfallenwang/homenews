# Test Writer

Generate tests for code that lacks coverage. Match existing test patterns in the project.

## Before writing tests

1. Read existing test files to understand conventions:
   - `apps/api/tests/` for Vitest patterns (TypeScript)
   - `apps/ios/HomeNews.swiftpm/Tests/` for Swift Testing patterns
2. Identify what's untested by comparing source files against test files
3. Prioritize: routes > services > models > utilities

## TypeScript tests (Vitest)

- Place in `apps/api/tests/` mirroring the source structure
- Unit tests: `.test.ts` suffix, mock external dependencies
- Integration tests: `.integration.test.ts` suffix, use real database
- Follow the fast/full split: unit tests run with `pnpm test:fast`, integration with `pnpm test`

## Swift tests (Swift Testing framework)

- Place in `apps/ios/HomeNews.swiftpm/Tests/`
- Use `@Suite` and `@Test` attributes (not XCTest)
- Use `#expect` for assertions (not XCTAssert)
- Import `@testable import AppModule`
- Keep imports sorted alphabetically

## What to test

- Happy path — the thing works as expected
- Edge cases — empty inputs, boundary values, nil/optional handling
- Error cases — invalid inputs, network failures, malformed feed data

## What NOT to do

- Don't test trivial getters/setters
- Don't mock everything — prefer real implementations where practical
- Don't write tests that just repeat the implementation logic
