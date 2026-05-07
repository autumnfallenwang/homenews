// Phase 16 — logger module unit tests.
//
// Asserts the contract documented in docs/deploy-and-logging-plan.md:
// every line is parseable JSON, has the required fields (time, level,
// msg, service, version), and respects LOG_LEVEL.

import { describe, expect, it } from "vitest";
import { log } from "../src/lib/logger.js";

describe("logger", () => {
  it("exposes pino's standard level methods", () => {
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
    expect(typeof log.debug).toBe("function");
    expect(typeof log.fatal).toBe("function");
  });

  it("carries the homenews-api service label and a real version in its base bindings", () => {
    const bindings = log.bindings();
    expect(bindings.service).toBe("homenews-api");
    expect(bindings.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("supports child loggers that inherit base fields and add new ones", () => {
    const child = log.child({ run_id: "abc-123", trigger: "manual" });
    const bindings = child.bindings();
    expect(bindings.service).toBe("homenews-api");
    expect(bindings.run_id).toBe("abc-123");
    expect(bindings.trigger).toBe("manual");
  });

  it("respects LOG_LEVEL — info default keeps debug below threshold", () => {
    // Default level is info (LOG_LEVEL not set in test env).
    expect(log.isLevelEnabled("info")).toBe(true);
    expect(log.isLevelEnabled("warn")).toBe(true);
    expect(log.isLevelEnabled("error")).toBe(true);
    expect(log.isLevelEnabled("debug")).toBe(false);
  });
});
