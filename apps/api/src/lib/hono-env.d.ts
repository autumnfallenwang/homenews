// Phase 16 — extend Hono's context map with the per-request fields the
// request-log middleware sets, so `c.set("req_id", id)` and
// `c.get("req_id")` are typed throughout the codebase without each app
// instance having to declare its own Variables generic.

import "hono";

declare module "hono" {
  interface ContextVariableMap {
    req_id: string;
  }
}
