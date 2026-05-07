// Phase 16 — Hono per-request access log.
//
// Mounted before all routes in app.ts. Emits one `event: "http.request"`
// JSON line per request with method/path/status/latency_ms/req_id. The
// req_id is also stashed via c.set("req_id", id) so route handlers can
// pull it out and stitch their own logs to the same trace via
// `log.child({ req_id: c.get("req_id") })`.

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
