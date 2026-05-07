// Phase 16 — structured logger.
//
// Writes one JSON object per line to stdout. Docker captures stdout;
// Promtail tails downstream into Loki. The app never manages files,
// transports, or rotation. See docs/deploy-and-logging-plan.md for the
// locked contract.
//
// Field conventions:
//   - Always present: `time`, `level`, `msg`, `service`, `version`
//   - Use `event` for categorical event names (`pipeline.run.start`, `embed.fail`)
//   - Use `*_ms` for durations, `*_count` for counts
//   - Use `err` for caught Errors (pino auto-serializes {type, message, stack})
//   - Use `req_id` (set by request middleware) and `run_id` (child logger
//     in pipeline.ts) for cross-line correlation
//
// LOG_LEVEL bumps verbosity at runtime — `info` in prod, `debug` for diagnosis.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pino } from "pino";

const pkgPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../package.json",
);
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
  name: string;
  version: string;
};

// Strip the `@homenews/` scope so Loki sees a flat label compatible with
// homecal / llm-gateway naming.
const service = pkg.name.replace(/^@[^/]+\//, "homenews-");

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service, version: pkg.version },
  timestamp: pino.stdTimeFunctions.isoTime,
});
