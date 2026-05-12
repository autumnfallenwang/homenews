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

## Cluster ops (post-Phase 17, GitOps)

Prod lives in the k3s cluster managed by `arch-infra`. ArgoCD owns the lifecycle (start/stop/scale/upgrade); humans `git push` and let CI + ArgoCD do the rest. The chart at `deploy/chart/` is the source of truth.

**Browse + observe:**

- ArgoCD UI: <http://argocd.arch.local> — sync status, drift, manual sync
- Grafana (Loki): <http://grafana.arch.local> — log search with full `event` / `req_id` / `run_id` schema
- Web app: <http://homenews.arch.local>
- API: <http://homenews-api.arch.local>
- `kubectl get pod,svc,ingress -n homenews` — quick health check from terminal

**Lifecycle (rare manual cases — usually ArgoCD does this):**

- `kubectl rollout restart deploy/homenews-api -n homenews` — bounce api pod (picks up env changes without a rebuild)
- `kubectl rollout restart deploy/homenews-web -n homenews` — bounce web pod
- `kubectl scale -n homenews deploy/homenews-{api,web} --replicas=0` — pause traffic (e.g. before invasive DB ops)
- `gh workflow run build.yml -R autumnfallenwang/homenews` — force a fresh image build without a code change

**Logs:**

- `kubectl logs -n homenews deploy/homenews-api -f` — real-time tail (single pod)
- Loki for history (30d retention), e.g. `curl -sG http://loki.arch.local/loki/api/v1/query_range --data-urlencode 'query={namespace="homenews"} | json | run_id="<id>"' --data-urlencode "start=$(date -u -d '-1 hour' +%s)000000000" --data-urlencode "end=$(date -u +%s)000000000"`

**Database (run inside the api pod, which has `tsx` + `drizzle-kit`):**

- `kubectl exec -n homenews deploy/homenews-api -- pnpm --filter @homenews/api exec drizzle-kit push` — apply pending migrations (idempotent)
- `kubectl exec -n homenews deploy/homenews-api -- pnpm --filter @homenews/api exec tsx src/db/seed.ts` — seed feeds (idempotent)
- `kubectl exec -n homenews deploy/homenews-api -- pnpm --filter @homenews/api exec tsx src/db/seed-settings.ts` — seed default settings (auto-runs at api boot too)
- `kubectl exec -n homenews deploy/homenews-api -- pnpm --filter @homenews/api exec tsx src/db/backfill-embeddings.ts` — one-shot embedding backfill (Task 91)
- `kubectl exec -n homenews deploy/homenews-api -- pnpm --filter @homenews/api exec tsx src/db/backfill-extraction.ts` — one-shot reader-mode backfill (Task 71b)
- `kubectl exec -n homenews homenews-db-0 -- psql -U homenews -d homenews` — psql shell directly in the DB pod

**Update flow:**

- `git push origin main` — CI runs `pnpm test:fast`, builds + pushes both images to GHCR at the commit SHA, and atomically bumps both `api.image.tag` + `web.image.tag` in `arch-infra/apps/homenews.yaml` via one `yq` write. ArgoCD picks up the change on its next ~3-min poll and rolls api + web together.
- `kubectl annotate app root -n argocd argocd.argoproj.io/refresh=hard --overwrite` — skip the 3-min poll. Refresh **`root`** (not `homenews`) because helm parameter changes flow through the app-of-apps.

## Docs

- [docs/progress.md](docs/progress.md) — current progress tracker
- [docs/design-plan.md](docs/design-plan.md) — app design and build phases
- [docs/lessons.md](docs/lessons.md) — corrections and patterns to avoid repeating
