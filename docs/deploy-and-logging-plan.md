# HomeNews — Production Deploy + Structured Logging Plan

Phase 16 (proposed). Two tightly-coupled tracks:

1. **Deploy**: containerize HomeNews (api + web + db) with a `homenews` CLI wrapper, mirroring the `homecal` pattern verbatim with HomeNews-specific adjustments (pgvector image, llm-gateway dependency).
2. **Logging**: replace ~80 ad-hoc `console.*` call sites with a structured pino logger writing JSON to stdout, ready for Promtail → Loki → Grafana ingestion. Mirrors the locked `llm-gateway/docs/structured-logging-spec.md` so a single Loki query spans all apps.

Both are designed so the same shape ports back to homecal afterward — same logger module, same field conventions, same CLI grammar, same compose layout.

## App-side responsibility (locked)

The app has **three obligations** for logs and zero others:

1. **Collect every event from every subsystem** through one logger import. No rogue `console.*`, no per-component log files, no separate streams.
2. **Label with a standard shape** — required `time`/`level`/`msg`/`service`/`version` plus a locked vocabulary of optional fields (`event`, `req_id`, `run_id`, `err`, `*_ms`, `*_count`). The shape is identical across gateway / homenews / homecal / future apps. **The shape IS the contract** — it's what makes Loki able to treat every app the same way.
3. **Emit through one portal** — JSON to stdout, one object per line. No file output, no syslog, no HTTP/Slack/email transports, no log shipping libraries. stdout is the boundary; everything past it is the platform's job.

Anything beyond these three — query languages, retention, dashboards, alerting, log search UIs, "show me errors in the last hour" features — belongs to Loki / Grafana / Promtail. The app does not own a query engine, an index, a search verb, or a retention policy. **Replace any layer below stdout without touching the apps.**

---

## Track 1 — Production deploy

### Reference: homecal

- `deploy/compose.yaml` — three services: db (postgres:17-alpine), api (host network, port 51001), web (host network, port 51000), all `restart: unless-stopped`, db has a healthcheck.
- `deploy/Dockerfile.api` — single-stage `node:22-alpine` + corepack pnpm, copies monorepo, `pnpm install --frozen-lockfile`, `CMD ["pnpm", "--filter", "@<app>/api", "start"]`.
- `deploy/Dockerfile.web` — multi-stage; builder runs `pnpm --filter @<app>/web build`, prod stage copies the Next.js standalone output and runs `node apps/web/server.js`.
- `deploy/homecal` — bash wrapper: `start | stop | restart | logs [service] | status | rebuild | update | version`. `update` runs `git pull origin main`, rebuilds, waits for db healthcheck, runs `drizzle-kit push`.

### What carries over unchanged

- Three-service compose layout
- Single-stage api Dockerfile pattern (corepack + pnpm + filtered start)
- Multi-stage web Dockerfile pattern (build → standalone)
- CLI grammar (start/stop/restart/logs/status/rebuild/update/version)
- `restart: unless-stopped` on every service
- DB healthcheck gate before api starts
- `network_mode: host` for api + web (matches single-host-on-Arch deployment)
- DB password literal in compose (only listens on the prod port on host; not exposed beyond loopback)

### What HomeNews changes

| Area | HomeCal | HomeNews | Why |
|---|---|---|---|
| DB image | `postgres:17-alpine` | `pgvector/pgvector:pg17` | Phase 15 needs `pg_trgm` + `pgvector` extensions; the alpine base doesn't ship them |
| Container names | `homecal-db-prod`, `homecal-api`, `homecal-web` | `homenews-db-prod`, `homenews-api`, `homenews-web` | Coexistence on the same host |
| Prod ports | web 51000, api 51001, db 51432 | web 52000, api 52001, db 52432 | Avoid collision with homecal + leave room for future apps |
| LLM gateway dep | none | reaches `http://localhost:51277` from host network | `network_mode: host` already covers it; no extra link needed |
| Drizzle migrations | `drizzle-kit push` against migration files | `drizzle-kit push` against `schema.ts` | HomeNews has no `drizzle/` migrations folder (per progress doc — push directly is the project workflow). Same command, same effect. |
| Dev DB container | shared with prod | `homenews-postgres` (dev, 5433) stays untouched; prod uses `homenews-db-prod` (52432) | Lets you iterate locally with `pnpm dev` while a prod stack runs alongside |
| First-time setup | none beyond migrations | settings auto-seed on api startup; `seed-feeds.ts` is a separate one-shot the operator runs explicitly | Settings DEFAULT_SETTINGS hydrate themselves; feed seeds are pinned to specific runs and shouldn't auto-run |
| Backfills | none | `homenews backfill embeddings` / `homenews backfill extraction` subcommands | Network-heavy one-shots from Tasks 71b + 91; never auto-run, always operator-triggered |

### Compose log capture (per-service)

Every service gets the same block as the gateway's:

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "5"
```

50MB cap per container, 5 rotated files. Promtail tails all rotation files so no log loss to Loki side. Without this, an idle prod stack with debug logs could fill `/var/lib/docker/` over months.

### CLI surface (`deploy/homenews`)

Identical grammar to `homecal`, plus three HomeNews-specific subcommands:

```
homenews start                    docker compose up -d --build
homenews stop                     docker compose down
homenews restart                  docker compose restart
homenews logs [service]           docker compose logs -f [service]
homenews status                   docker compose ps
homenews rebuild                  docker compose up -d --build --force-recreate
homenews update                   git pull, rebuild, drizzle-kit push, optional re-seed
homenews version                  print package.json version

  # HomeNews-specific
homenews backfill <kind>          run db:backfill-embeddings / db:backfill-extraction inside the api container
homenews seed feeds               run seed-feeds.ts (first-time only — additive, idempotent)
```

**No `logs query` verb.** The app does not own a Loki access path. Operators query Loki directly via `logcli` or Grafana — one access path that works for every app, not three different per-app shells. `homenews logs` stays as the local Docker tail (an *operator* command for the *app*, not a Loki feature) and that's the only `logs` HomeNews owns. This is a deliberate scope cut from the original draft to keep the app-side surface to "collect, label, emit" — nothing more.

Notes on CLI design:

- **`logs` is the local Docker tail** (`docker compose logs -f`) — works whether Loki is up or down, day-zero usable, never goes away.
- **`update` is non-destructive** by default — it pulls main, rebuilds, runs `drizzle-kit push`. It does **not** re-seed feeds or run backfills (those are explicit subcommands).
- **`backfill` runs inside the api container** so the LLM gateway URL + DB URL are exactly what the running app uses; no env drift between operator shell and container.

### Dockerfile.api specifics

Mirror homecal's, plus:
- Copy `apps/api/src/db/seed-feeds.ts`, `seed-settings.ts`, `seed-new-sources-2026-04-13.ts`, `seed-upgrade-sites-2026-04-13.ts`, `backfill-extraction.ts`, `backfill-embeddings.ts` into the image so `homenews seed`/`homenews backfill` can `docker exec` into them.
- No `drizzle/` directory exists for HomeNews — `drizzle-kit push` reads `schema.ts` directly. Just copy `drizzle.config.ts`.
- `EXPOSE 52001`, `CMD ["pnpm", "--filter", "@homenews/api", "start"]`.

### Dockerfile.web specifics

Mirror homecal's exactly. Build args:

```
ARG NEXT_PUBLIC_API_URL=http://localhost:52001
```

(no auth URL — HomeNews has no auth yet)

### Things deliberately NOT in the deploy stack

- **Loki / Promtail / Grafana**: lives in a separate shared observability compose (`~/agentic/observability/` or wherever you decide). HomeNews emits logs and points its compose `json-file` driver at the standard location; Promtail handles ingestion. One Loki for gateway + homenews + homecal + future apps.
- **TLS / reverse proxy**: out of scope for v1. LAN-only access via host network. Add Caddy/Traefik later if remote access is wanted.
- **Backups**: out of scope for v1. PG volume snapshots are an Arch host concern.
- **Auto-update / watchtower**: out of scope. Manual `homenews update` is the contract.
- **Health endpoints beyond `/health`**: keep simple; observability comes from logs, not endpoint pings.

### Verification

```bash
# 1. Stack boots clean
homenews start
homenews status                            # all 3 containers Up + healthy

# 2. Web reachable
curl -sf http://localhost:52000/             # HTTP 200

# 3. API reachable + DB connected + settings seeded
curl -sf http://localhost:52001/admin/pipeline/status
curl -sf http://localhost:52001/settings | jq '.[] | select(.key=="llm_model_analyze")'
                                             # claude-haiku-4-5

# 4. First-run feed seed
homenews seed feeds                          # idempotent — no-op on re-run

# 5. Manual pipeline trigger via API (no separate CLI verb yet)
curl -N http://localhost:52001/admin/pipeline/stream

# 6. Backfill (only after first analyze pass)
homenews backfill embeddings                 # ~1764/1793 expected if rerunning
```

---

## Track 2 — Structured logging

### Contract (locked, mirrors `llm-gateway/docs/structured-logging-spec.md`)

- **One JSON object per line, written to stdout. No file output from app code.**
- **Library: `pino` + `pino-pretty` for dev.** Same as gateway.
- **Universal shape** ingested by Loki/ELK/Datadog without re-mapping.
- **Per-process logger** with `base: { service, version }` so Loki can pivot across `homenews-api` / `homenews-web` / `llm-gateway` / `homecal-*` queries.
- **`LOG_LEVEL` env var** for runtime verbosity bumps without redeploy.
- **Per-request access logs** via Hono middleware (currently zero request-level observability in HomeNews).
- **Pipeline-run correlation** via pino child loggers carrying `run_id` so all events for one orchestrator run filter together.

### The log line shape

Required fields on every line:

| Field | Source | Example |
|---|---|---|
| `time` | pino `stdTimeFunctions.isoTime` | `"2026-05-07T04:53:04.301Z"` |
| `level` | pino default | `"info"` / `"warn"` / `"error"` / `"debug"` / `"fatal"` |
| `msg` | passed to logger | `"analyze item complete"` |
| `service` | base config | `"homenews-api"` or `"homenews-web"` |
| `version` | base config | `"0.1.0"` |

Conventionalized optional fields:

| Field | When | Example |
|---|---|---|
| `event` | always when there's a categorical event | `"pipeline.run.start"`, `"embed.fail"`, `"http.request"` |
| `req_id` | inside HTTP handlers | UUID per request |
| `run_id` | inside pipeline-run code paths | the `pipeline_runs.id` UUID |
| `feed_name` / `feed_id` | feed-level events | `"arXiv cs.AI"` |
| `article_id` / `article_title` | article-level events | UUID + title |
| `model` / `task` | LLM events | `"claude-haiku-4-5"`, `"analyze"` |
| `*_ms` | durations in milliseconds | `latency_ms: 103` |
| `*_count` | integer counts | `added_count: 18` |
| `status` | HTTP status | `200` |
| `err` | caught Error | pino auto-serializes `{type, message, stack}` |

### Module layout

`apps/api/src/lib/logger.ts`:

```ts
import { pino } from "pino";
import { name as packageName, version } from "../../package.json" with { type: "json" };

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: packageName.replace("@homenews/", "homenews-"), version },
  timestamp: pino.stdTimeFunctions.isoTime,
});
```

`apps/web/src/lib/logger.ts` — same shape, `service: "homenews-web"`. Used only in route handlers / server actions where we control the call site; Next.js's own access logs stay unstructured (Promtail ingests them with `service` label set by container name).

### Hono request middleware (new file: `apps/api/src/middleware/request-log.ts`)

```ts
import type { MiddlewareHandler } from "hono";
import { log } from "../lib/logger.js";

export const requestLog: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const req_id = crypto.randomUUID();
  c.set("req_id", req_id);
  await next();
  log.info(
    {
      event: "http.request",
      req_id,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      latency_ms: Date.now() - start,
    },
    "request handled",
  );
};
```

Mounted at the top of `apps/api/src/index.ts` before any route registrations.

### Pipeline-run correlation

The orchestrator already prefixes `[pipeline] run <runId> ...` manually. With pino we get this for free via child loggers:

```ts
// services/pipeline.ts, near the top of runPipelineWithProgress()
const runLog = log.child({ run_id: runId, trigger });
runLog.info({ event: "pipeline.run.start" }, "pipeline run started");

// passed down to analyze.ts / summarize.ts via the existing options bag
await analyzeUnanalyzed(batchSize, { onProgress, signal, log: runLog });
```

Every event emitted from inside the run carries `run_id` automatically, and a single Loki query like `{service="homenews-api"} | json | run_id="730bc922-..."` returns the full audit trail for that run across all phases.

### Event taxonomy (locked before migration)

Dotted lowercase, namespace-first. One namespace per subsystem:

| Namespace | Events |
|---|---|
| `pipeline` | `run.start`, `run.done`, `run.failed`, `run.cancelled`, `phase.start`, `phase.done` |
| `fetch` | `feed.ok`, `feed.error`, `summary` |
| `analyze` | `start`, `allocation`, `item.start`, `item.done`, `item.failed`, `tag.dropped`, `done` |
| `summarize` | `start`, `item.start`, `item.done`, `item.failed`, `done` |
| `reader` | `ok`, `skip`, `fail` |
| `embed` | `ok`, `fail` |
| `llm` | `primary.ok`, `primary.failed`, `fallback.used` |
| `search` | `query`, `query.embed.failed` |
| `scheduler` | `tick`, `skipped`, `started`, `stopped` |
| `settings` | `seeded`, `update` |
| `migration` | `applied` |
| `http` | `request` (middleware) |
| `server` | `start`, `shutdown` |

### Migration scope

~80 call sites across `apps/api/src/`. Mechanical translation; each follows one of three patterns from the gateway spec:

1. **Bracketed namespace string → `event` field** — `console.info("[pipeline] run X start")` becomes `runLog.info({ event: "pipeline.run.start" }, "pipeline run started")`
2. **Template strings with dynamic values → fields** — `console.info(\`[reader] ok url=${url} chars=${n}\`)` becomes `log.info({ event: "reader.ok", url, chars: n }, "reader extraction succeeded")`
3. **Error logs with caught exceptions → `err` field** — `console.warn(\`[embed] fail … error=${msg}\`)` becomes `log.warn({ event: "embed.fail", chars, err }, "embedding failed")` (pino auto-serializes Error objects to `{type, message, stack}`)

By subsystem (rough estimate from the earlier audit):

| Subsystem | Files | Approx count |
|---|---|---|
| Pipeline orchestrator | `services/pipeline.ts` | ~12 |
| Analyze | `services/analyze.ts` | ~10 |
| Summarize | `services/summarize.ts` | ~6 |
| Reader | `services/reader.ts` | ~6 |
| Embed | `services/embed.ts` | ~6 |
| LLM executor | `services/llm-executor.ts` | ~5 |
| Search | `routes/search.ts` | ~3 |
| Scheduler | `services/scheduler.ts` | ~5 |
| Settings | `services/settings.ts` | ~3 |
| Highlights | `routes/articles.ts`, `routes/highlights.ts` | ~2 |
| Backfill scripts | `db/backfill-*.ts` | ~10 |
| Migrations / seeds | `db/seed-*.ts` | ~8 |
| Server startup | `index.ts` | ~3 |
| **Total** | | **~80** |

### Label architecture (how Loki separates streams)

Three label sources, each set by a different actor. They stack — Loki queries pivot on whichever combination you want.

| Label | Set by | Example |
|---|---|---|
| `container` | Promtail (Docker SD) | `homenews-api`, `homenews-web`, `homenews-db-prod` |
| `image` | Promtail (Docker SD) | `pgvector/pgvector:pg17` |
| `host` | Promtail config | `arch-home` |
| `service` | App's pino base config | `homenews-api`, `homenews-web` |
| `version` | App's pino base config | `0.1.0` |
| `event` | Each call site | `pipeline.run.start`, `http.request`, `embed.fail` |
| `level` | pino | `info` / `warn` / `error` |
| `req_id` / `run_id` | middleware / child logger | UUIDs |

The first three are attached automatically by Promtail at scrape time — the app does nothing. The next two come from the app's pino instance. The rest come from the call site that emits the event.

Each container is a **separate stream** in Loki by default; you join across them with queries when you want.

### Mixed-source acceptance (PG, Next.js own logs)

Loki ingests anything — JSON, plain text, multi-line stack traces. Parsing is a query-time choice (`| json` filter), not an ingest requirement.

- **Postgres** emits its native log format on stdout; container labeled `homenews-db-prod`. Querying is line-grep (`|~ "ERROR"`), not field-query. Acceptable — PG logs are mostly noise unless something's broken; line-grep is enough when it does.
- **Next.js's own access lines** (`[next] GET / 200 in 320ms` and friends) come through unstructured too. Same treatment. We do **not** try to wrap them; structured fields go where we control the call (route handlers, server actions, middleware), not where we don't.

The investment in structured fields pays off where we control the code (api + web pino call sites). For PG and Next-internal lines, the container label + line-grep covers the realistic operator workflow.

### What we don't implement

- **No file output from the app.** Docker writes the json-file capture; we don't.
- **No log rotation logic in app.** Docker handles it via the size cap above.
- **No HTTP/Slack/email transports.** Promtail ships to Loki; alerting is Grafana's job.
- **No request body logging by default.** Article URLs and search queries can be PII-adjacent; log path + status + latency only. Bodies opt-in via `LOG_LEVEL=debug` and only for the request middleware.
- **No correlation IDs from upstream.** `req_id` is generated server-side per-request. No `X-Request-Id` header propagation yet.
- **No metrics.** Prometheus territory; separate phase if/when dashboards are wanted.
- **No upgrade for Next.js's own access lines.** They show up in Loki as unstructured text, which is fine — Promtail labels them by container.

### Tests

- Unit test the logger module imports and emits the expected base fields.
- Hono middleware test: dispatch a fake request, capture stdout via pino's `destination` option to a buffer, assert one `http.request` line with the right shape.
- Don't test every migrated call site — they're plumbing. Trust the type system.
- E2E unaffected — assertions are on response codes/bodies, not log output.

### Verification (post-migration)

```bash
# 1. Container emits structured JSON
homenews logs homenews-api | head -5
# expect: lines parseable as JSON, each with time/level/msg/service/version

# 2. Levels respect LOG_LEVEL
docker exec homenews-api sh -c 'env | grep LOG_LEVEL'

# 3. Per-request log fires
curl -sf http://localhost:52001/admin/pipeline/status
homenews logs homenews-api | tail -3
# expect: one line with event=http.request, status=200, latency_ms=...

# 4. Pipeline-run correlation
curl -N http://localhost:52001/admin/pipeline/stream &
homenews logs homenews-api | jq 'select(.run_id == "<the-run-id>")'
# expect: every pipeline/analyze/summarize/reader/embed event for that run

# 5. Once Loki is deployed
logcli query '{service="homenews-api"} | json | event=~"embed.*" | level="warn"'
```

---

## Open question deferred

**Promtail vs Alloy vs Vector** for the shipping layer. Three reasonable choices:

- **Promtail** — Grafana's classic, simple, Loki-native. Smallest setup.
- **Alloy** — Grafana's newer agent, supersedes Promtail+Loki+Tempo+Mimir agents. Heavier, but futureproof if you add metrics or traces later.
- **Vector** — Datadog OSS. Faster, more flexible routing. Diverges from the Grafana-stack story.

Recommend Promtail for v1 since the only goal is logs and the gateway spec already names it. Revisit if metrics enter scope.

---

## Sequencing recommendation

Order matters because the deploy gives the logger somewhere to run.

1. **Deploy track first** — Dockerfile.api, Dockerfile.web, compose.yaml, `homenews` CLI. Stack boots with current `console.*` logging unchanged. Verifies the production shape works end-to-end.
2. **Logger module + middleware** — `apps/api/src/lib/logger.ts`, `apps/web/src/lib/logger.ts`, request middleware. No call-site migration yet. Both modules ship; tests assert shape.
3. **Migration in subsystem-sized chunks** — pipeline first (highest-value events), then analyze + summarize, then reader + embed + llm, then routes + scheduler + settings, then backfills + seeds + index.ts. Each chunk is one PR with its own diff so the change is reviewable.
4. **Loki + Promtail standup** — separate shared observability compose, owned outside this repo. HomeNews is a logs *producer*; Loki is the *consumer*. They land independently and the app never knows about Loki's existence.
5. **Port to homecal** — same Dockerfiles already exist; the new pieces are the logger module + middleware + the same locked event taxonomy. Mostly copy/paste from this work.
