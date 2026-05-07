// Phase 16 — structured logger for the Next.js server side.
//
// Used in route handlers, server actions, and any custom server code where
// we control the call. Next.js's own access lines (`[next] GET / 200 ...`)
// stay unstructured — Promtail labels them by container and that's enough.
//
// Same shape as apps/api/src/lib/logger.ts so a single Loki query can
// span both services. See docs/deploy-and-logging-plan.md for the
// locked contract.

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

const service = pkg.name.replace(/^@[^/]+\//, "homenews-");

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service, version: pkg.version },
  timestamp: pino.stdTimeFunctions.isoTime,
});
