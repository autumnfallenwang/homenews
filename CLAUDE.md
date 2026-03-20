# HomeNews

Personal AI news intelligence — Turborepo monorepo with Hono API + Next.js frontend + iOS Swift app.

## Stack

Turborepo + pnpm | Hono + Zod (API) | Next.js App Router (Web) | Swift + SwiftUI (iOS) | PostgreSQL + Drizzle | Vitest + Biome | SwiftLint

## Structure

- `apps/api/` — Hono backend API (port 3001)
- `apps/web/` — Next.js frontend (port 3000)
- `apps/ios/` — SwiftUI iOS app (Swift Package Manager)
- `packages/shared/` — shared Zod schemas and types
- `docs/` — design docs

## Commands

All commands run from the repo root via Turborepo:

- `pnpm dev` — start all dev servers (API + Web) in parallel
- `pnpm build` — build all packages
- `pnpm test` — run all tests
- `pnpm test:fast` — unit tests only
- `pnpm lint` — lint check all packages
- `pnpm lint:fix` — auto-fix lint

### Per-package commands

- `pnpm --filter @homenews/api dev` — start only the API server
- `pnpm --filter @homenews/web dev` — start only the web frontend
- `pnpm --filter @homenews/api test` — run API tests only

### iOS / Swift commands

- `cd apps/ios/HomeNews.swiftpm && xcodebuild build -scheme HomeNews -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -quiet` — build iOS app
- `cd apps/ios/HomeNews.swiftpm && swiftlint` — lint Swift code

## Docs

- [docs/progress.md](docs/progress.md) — current progress tracker
- [docs/design-plan.md](docs/design-plan.md) — app design and build phases
- [docs/lessons.md](docs/lessons.md) — corrections and patterns to avoid repeating
