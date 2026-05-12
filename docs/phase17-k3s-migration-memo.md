# Phase 17 — k3s migration

Move HomeNews off the single-host `docker compose` stack onto the home k3s cluster managed by `arch-infra` (Argo CD GitOps). Mirrors the playbook validated on llmgw (2026-05-10 → 2026-05-11) but with the extra shape that HomeNews carries: two app containers (`homenews-api`, `homenews-web`), a stateful Postgres with `pgvector` + `pg_trgm`, and a pre-existing prod database that must migrate without data loss.

This memo is the design + checklist. The reference for the cluster itself (Argo CD layout, Alloy/Loki conventions, gotchas) is `docs/k3s-migration/02-K3S_REFERENCE.md`.

## Why now

- HomeNews is the last app still on the legacy docker-compose-on-host pattern. The cluster is up, observability is live, and llmgw has proven the loop end-to-end.
- Phase 16 Task 103 (verify Loki ingestion + `run_id` correlation) was deferred until a Loki target existed. The k3s observability stack is that target — Phase 17 unblocks it.
- The current compose stack uses `network_mode: host` to reach the host-resident `llm-gateway:51277`. llmgw has moved into the cluster (`http://llmgw.llmgw`), so the workaround is now unnecessary and the network model gets cleaner as a side effect.

## What changes (and what doesn't)

**Unchanged:**
- Application code structure, schema, pipeline orchestrator, logger contracts. Phase 16's structured logging already emits the exact JSON shape Alloy → Loki expects.
- Image build via `Dockerfile.api` + `Dockerfile.web`. The compose stack stays in-tree for ≥3 days post-cutover as a rollback path.

**Changed:**
- Deployment surface: docker-compose → Helm chart at `deploy/chart/` synced by Argo CD.
- Database hosting: docker container with a docker named volume → in-cluster StatefulSet with a `local-path` PVC. Data migrates via `pg_dump | psql`.
- External URLs: `http://<host>:52000` / `http://<host>:52001` → `http://homenews.arch.local` (web) + `http://homenews-api.arch.local` (api), routed by Traefik.
- Internal LLM gateway URL: `http://localhost:51277` → `http://llmgw.llmgw` (in-cluster Service DNS).
- Image registry: local docker build → `ghcr.io/autumnfallenwang/homenews-{api,web}` via GHA on push to main.
- GitOps source of truth: this repo's `deploy/compose.yaml` → `arch-infra/apps/homenews.yaml` (Argo CD Application CR pointing at this repo's `deploy/chart`).

## Cluster shape (target)

```
namespace: homenews
├── statefulset/homenews-db        pgvector/pgvector:pg17 (1 replica, Recreate, fsGroup 999)
│   └── pvc/homenews-db-data       10Gi local-path, /var/lib/postgresql/data
├── deployment/homenews-api        ghcr.io/autumnfallenwang/homenews-api:<sha> (1 replica, Recreate)
├── deployment/homenews-web        ghcr.io/autumnfallenwang/homenews-web:<sha> (1 replica, RollingUpdate)
├── service/homenews-db            ClusterIP, port 5432 → 5432
├── service/homenews-api           ClusterIP, port 80   → 52001
├── service/homenews-web           ClusterIP, port 80   → 52000
├── ingress/homenews-web           Traefik, host homenews.arch.local       → svc/homenews-web
└── ingress/homenews-api           Traefik, host homenews-api.arch.local   → svc/homenews-api
```

Notes on the shape:
- **Two ingresses, not path-based routing.** Mirrors the LAN convention (one hostname per service) and avoids CORS / rewrite headaches with the web's API client.
- **API deployment uses `Recreate`** because the scheduler is a node-cron singleton inside the API process. Two replicas would double-fire fetch/analyze/summarize. Single replica + Recreate matches llmgw.
- **Web deployment can use `RollingUpdate`** (stateless), but keep it single-replica for now to match resource footprint.
- **DB as StatefulSet, not Deployment** — gives a stable pod name (`homenews-db-0`) and a PVC template, which lets us drop the PVC into a separate `pvc.yaml` only if we ever need to pre-seed it.

## Postgres password handling

The current compose stack ships `POSTGRES_PASSWORD=homenews_prod` in plaintext. Two viable options:

1. **Plaintext in `values.yaml`** — LAN-only, no exposure beyond the cluster. Matches what's already in `deploy/compose.yaml`. Lowest friction.
2. **Install Sealed Secrets first** — encrypts the password at rest in `arch-infra`. Listed in the reference doc as "next platform install when first DB password lands" and would land before homecal anyway.

**Recommendation: option 1 for cutover, then revisit.** The cluster reference doc already pre-staged Sealed Secrets as a separate platform install; bundling it into the homenews cutover doubles the surface area and the LAN-only password is not a real secret. Flip to Sealed Secrets later as a no-downtime swap (the DB stays up; the env var source changes).

## Data migration

The existing prod data lives in a docker named volume on the host:

```
docker volume inspect deploy_homenews-db-prod-data
# Mountpoint → /var/lib/docker/volumes/deploy_homenews-db-prod-data/_data
```

Migration path (run in Phase E):

```bash
# 1. Bring up the new cluster pod against an empty PVC.
kubectl get pod -n homenews -w   # wait for homenews-db-0 Running, 1/1 Ready

# 2. Dump from the legacy container, restore into the cluster pod.
docker exec homenews-db-prod \
  pg_dump -U homenews -Fc homenews_prod \
  > /tmp/homenews-prod.dump

kubectl exec -n homenews -i homenews-db-0 -- \
  pg_restore -U homenews -d homenews_prod --no-owner --no-acl \
  < /tmp/homenews-prod.dump

# 3. Verify extensions are present (the image includes them; the dump preserves CREATE EXTENSION).
kubectl exec -n homenews homenews-db-0 -- \
  psql -U homenews -d homenews_prod -c '\dx'
# Expect: pgvector, pg_trgm

# 4. Sanity-check row counts before flipping traffic.
kubectl exec -n homenews homenews-db-0 -- \
  psql -U homenews -d homenews_prod \
  -c 'SELECT (SELECT count(*) FROM articles) AS articles,
             (SELECT count(*) FROM article_analysis) AS analyses,
             (SELECT count(*) FROM highlights) AS highlights;'
```

**Gotcha**: the `pgvector` extension stores embeddings as a custom type; a plaintext `pg_dump` works fine as long as both ends run the `pgvector/pgvector:pg17` image (which they do). The `-Fc` (custom format) dump is preferred — smaller and lets `pg_restore` parallelize.

**Downtime**: ~10-20 min during the dump/restore depending on embedding volume. Acceptable for a personal app.

## Image build pipeline

Each of `homenews-api` and `homenews-web` becomes its own GHCR image:

- `ghcr.io/autumnfallenwang/homenews-api:<sha>`
- `ghcr.io/autumnfallenwang/homenews-web:<sha>`

GHA `build.yml` matrix-builds both images in parallel from the same monorepo checkout, then runs **two** `yq` rewrites in a single arch-infra commit:

```bash
SHA="${GITHUB_SHA}" yq -i '
  (.spec.source.helm.parameters[] | select(.name == "api.image.tag") | .value) = strenv(SHA) |
  (.spec.source.helm.parameters[] | select(.name == "web.image.tag") | .value) = strenv(SHA)
' apps/homenews.yaml
```

This atomically rolls api + web together. Locking them to the same SHA matters because the web build embeds `NEXT_PUBLIC_API_URL` at build time and the API contract evolves in lockstep.

**GHCR visibility**: same gotcha as llmgw — both packages are private by default on first push. Manual flip to public in package settings, twice.

## Networking specifics

- **API → DB**: `DATABASE_URL=postgres://homenews:homenews_prod@homenews-db:5432/homenews_prod` (Service DNS, port 5432 direct).
- **API → LLM gateway**: `LLM_GATEWAY_URL=http://llmgw.llmgw` (Service DNS, port 80 = llmgw's `targetPort: 51277`). No more `localhost:51277`. No more `network_mode: host`.
- **Web → API**: `NEXT_PUBLIC_API_URL=http://homenews-api.arch.local` (build arg, baked into the standalone build). The browser hits the API directly through its own Ingress — no proxy hop.
- **Pod-to-pod CORS**: API needs `Access-Control-Allow-Origin: http://homenews.arch.local` (or `*` for LAN). Already configured via Hono cors middleware — verify the env var maps correctly.

## securityContext

Per gotcha #4 in the reference doc:

```yaml
podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  runAsGroup: 1000
  fsGroup: 1000        # for the API pod (PVC ownership only matters on DB pod, where fsGroup: 999 matches postgres)
containerSecurityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: false   # Next.js writes to .next/cache; flipping this on requires emptyDir mount
  capabilities:
    drop: [ALL]
```

The Dockerfiles already run as `USER node` (UID 1000). DB image runs as `postgres` (UID 999) — needs its own `podSecurityContext` block in the StatefulSet.

## Out of scope (deliberately)

- Sealed Secrets install. Tracked separately; not blocking.
- Grafana dashboards for homenews. Deferred to a later phase per user direction.
- HPA / multi-replica anything. Personal app, single-host cluster.
- Backups for the new PVC. Same parity as today (docker volume had no backup either); revisit when it bites.
- `homenews` CLI deprecation. Keep the script for the rollback window, retire after.
- Moving `LOG_LEVEL` into a ConfigMap. Plaintext in `values.yaml` is fine.

## Verification (Phase 17F)

This is also the verification block from Phase 16 Task 103, which gets retired as part of this phase:

```bash
# 1. New pods up, ready
kubectl get pod -n homenews
# Expect: homenews-db-0 Running 1/1, homenews-api-<hash> Running 1/1, homenews-web-<hash> Running 1/1

# 2. Ingress smoke
curl -fsS http://homenews-api.arch.local/health
curl -fsS http://homenews.arch.local/

# 3. End-to-end pipeline run, capture run_id from response
curl -sS -X POST http://homenews-api.arch.local/admin/pipeline/run-all | jq .

# 4. Loki proves run_id correlates across phases
RUN_ID="<from step 3>"
curl -sG http://loki.arch.local/loki/api/v1/query_range \
  --data-urlencode "query={namespace=\"homenews\"} | json | run_id=\"${RUN_ID}\"" \
  --data-urlencode "start=$(date -u -d '-10 min' +%s)000000000" \
  --data-urlencode "end=$(date -u +%s)000000000" | jq '.data.result | length'
# Expect: > 0 entries spanning fetch / analyze / summarize phases

# 5. http.request middleware fires
curl -sG http://loki.arch.local/loki/api/v1/query_range \
  --data-urlencode 'query={service="homenews-api"} | json | event="http.request"' \
  --data-urlencode "start=$(date -u -d '-2 min' +%s)000000000" \
  --data-urlencode "end=$(date -u +%s)000000000" | jq '.data.result | length'

# 6. LOG_LEVEL respected (bump to debug, see debug lines, revert)
kubectl set env -n homenews deploy/homenews-api LOG_LEVEL=debug
kubectl rollout status -n homenews deploy/homenews-api
# trigger a small action, then:
curl -sG http://loki.arch.local/loki/api/v1/query_range \
  --data-urlencode 'query={service="homenews-api"} | json | level="debug"' ...
kubectl set env -n homenews deploy/homenews-api LOG_LEVEL=info
```

## Task list

Numbered 104+ to continue the progress.md sequence after Phase 16's 97-103.

| # | Task |
|---|------|
| 104 | Helm chart scaffold at `deploy/chart/` (Chart.yaml, values.yaml, .helmignore, NOTES.txt, _helpers.tpl) |
| 105 | `templates/statefulset-db.yaml` + `templates/service-db.yaml` (pgvector pg17, RWO PVC, podSecurityContext for postgres UID) |
| 106 | `templates/deployment-api.yaml` + `templates/service-api.yaml` + `templates/ingress-api.yaml` (Recreate, env wired to DB + llmgw Service) |
| 107 | `templates/deployment-web.yaml` + `templates/service-web.yaml` + `templates/ingress-web.yaml` |
| 108 | Code touchups: default `LLM_GATEWAY_URL` and CORS allowed origin for the new in-cluster URLs |
| 109 | Multi-stage Dockerfile audit (api + web) — confirm runtime layer is slim, no compile intermediates |
| 110 | `.github/workflows/build.yml` — matrix build api + web, push to GHCR, bump both image tags in arch-infra via yq |
| 111 | `.github/dependabot.yml` — npm + docker + github-actions, weekly |
| 112 | GitHub PAT `ARCH_INFRA_TOKEN` as repo secret; first push to main; flip both GHCR packages to public |
| 113 | `arch-infra/apps/homenews.yaml` Application CR (two image.tag params) — validate with `kubectl apply --dry-run=client`, then commit |
| 114 | Data migration: `pg_dump -Fc` from compose container, `pg_restore` into `homenews-db-0`, verify extensions + row counts |
| 115 | Cutover: add `192.168.1.163 homenews.arch.local homenews-api.arch.local` to dev box `/etc/hosts`; smoke ingress + end-to-end pipeline |
| 116 | Verification: Phase 16 Task 103 closeout — run the Loki queries from this memo's Verification section |
| 117 | Decommission: `docker compose down` legacy stack, retain `deploy/compose.yaml` for ≥3 days as rollback, then plan removal in a follow-up |
| 118 | Changelog + lessons entries |

## Open questions to resolve before starting

- **Hostname pair vs single host with path routing**: this memo proposes two hostnames. Confirm before writing the Ingresses.
- **Sealed Secrets timing**: plaintext for cutover (this memo's recommendation) or install first?
- **PVC size**: 10Gi proposed. Current docker volume actual usage unknown — `du -sh /var/lib/docker/volumes/deploy_homenews-db-prod-data/_data` before sizing.
- **Backfill scripts**: the existing `homenews backfill` / `homenews seed` CLI verbs — do we port them into a Kubernetes Job, or `kubectl exec` into the api pod ad-hoc? llmgw didn't have this; first new shape.

These get answered as part of Task 104 kickoff, not before.
