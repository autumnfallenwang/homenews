// Phase 16 — request-log middleware tests.
//
// Mocks the logger singleton, dispatches synthetic Hono requests, and
// asserts the middleware emits exactly one `event: "http.request"` line
// per request with the right shape. The middleware sets `req_id` on the
// context so downstream handlers can stitch their logs.

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock hoists to the top of the file, so its factory can't close over
// module-top variables. vi.hoisted runs early enough that the mock can.
const { infoMock } = vi.hoisted(() => ({ infoMock: vi.fn() }));

vi.mock("../src/lib/logger.js", () => ({
  log: {
    info: infoMock,
  },
}));

import { requestLog } from "../src/middleware/request-log.js";

beforeEach(() => {
  infoMock.mockClear();
});

function makeApp() {
  const app = new Hono();
  app.use("*", requestLog);
  app.get("/echo", (c) => c.json({ req_id: c.get("req_id") }));
  app.get("/boom", () => {
    throw new Error("intentional");
  });
  return app;
}

describe("requestLog middleware", () => {
  it("emits one http.request line per request with the expected fields", async () => {
    const app = makeApp();
    const res = await app.request("/echo");
    expect(res.status).toBe(200);
    expect(infoMock).toHaveBeenCalledTimes(1);
    const [fields, msg] = infoMock.mock.calls[0];
    expect(msg).toBe("request handled");
    expect(fields.event).toBe("http.request");
    expect(fields.method).toBe("GET");
    expect(fields.path).toBe("/echo");
    expect(fields.status).toBe(200);
    expect(typeof fields.latency_ms).toBe("number");
    expect(fields.latency_ms).toBeGreaterThanOrEqual(0);
    expect(fields.req_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("attaches req_id to the Hono context so handlers can read it", async () => {
    const app = makeApp();
    const res = await app.request("/echo");
    const body = (await res.json()) as { req_id: string };
    const [fields] = infoMock.mock.calls[0];
    expect(body.req_id).toBe(fields.req_id);
  });

  it("generates a fresh req_id per request (no reuse across calls)", async () => {
    const app = makeApp();
    await app.request("/echo");
    await app.request("/echo");
    expect(infoMock).toHaveBeenCalledTimes(2);
    const [first] = infoMock.mock.calls[0];
    const [second] = infoMock.mock.calls[1];
    expect(first.req_id).not.toBe(second.req_id);
  });
});
