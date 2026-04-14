import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/services/settings.js", () => ({
  getSetting: vi.fn(),
}));

import { getNextScheduledRunAt } from "../src/services/cron-next.js";
import { getSetting } from "../src/services/settings.js";

// Helper to stub the two settings this function reads.
function mockSettings(values: { scheduler_enabled?: boolean; fetch_interval?: string }) {
  vi.mocked(getSetting).mockImplementation((key: string) => {
    if (key === "scheduler_enabled") {
      return Promise.resolve(values.scheduler_enabled as never);
    }
    if (key === "fetch_interval") {
      return Promise.resolve(values.fetch_interval as never);
    }
    return Promise.resolve(undefined as never);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getNextScheduledRunAt", () => {
  it("returns a Date when scheduler is enabled and cron expression is valid", async () => {
    mockSettings({ scheduler_enabled: true, fetch_interval: "0 */2 * * *" });
    const result = await getNextScheduledRunAt();
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBeGreaterThan(Date.now());
  });

  it("computes the next-fire time for an every-minute cron (within ~60s of now)", async () => {
    mockSettings({ scheduler_enabled: true, fetch_interval: "* * * * *" });
    const before = Date.now();
    const result = await getNextScheduledRunAt();
    expect(result).toBeInstanceOf(Date);
    const delta = result!.getTime() - before;
    // Next minute boundary is at most 60s away
    expect(delta).toBeGreaterThanOrEqual(0);
    expect(delta).toBeLessThanOrEqual(60_000);
  });

  it("computes the next-fire time for an hourly-at-00 cron (minute=0)", async () => {
    mockSettings({ scheduler_enabled: true, fetch_interval: "0 * * * *" });
    const result = await getNextScheduledRunAt();
    expect(result).toBeInstanceOf(Date);
    expect(result!.getMinutes()).toBe(0);
    expect(result!.getSeconds()).toBe(0);
  });

  it("returns null when scheduler_enabled=false", async () => {
    mockSettings({ scheduler_enabled: false, fetch_interval: "0 */2 * * *" });
    expect(await getNextScheduledRunAt()).toBeNull();
  });

  it("returns null when fetch_interval is missing", async () => {
    mockSettings({ scheduler_enabled: true });
    expect(await getNextScheduledRunAt()).toBeNull();
  });

  it("returns null when fetch_interval is an empty string", async () => {
    mockSettings({ scheduler_enabled: true, fetch_interval: "" });
    expect(await getNextScheduledRunAt()).toBeNull();
  });

  it("returns null when fetch_interval is malformed", async () => {
    mockSettings({ scheduler_enabled: true, fetch_interval: "not a cron expression" });
    expect(await getNextScheduledRunAt()).toBeNull();
  });

  it("falls through to the cron check when scheduler_enabled is undefined (defensive)", async () => {
    // Setting not yet seeded — we prefer to compute a sensible next-fire
    // rather than null out during the startup window.
    mockSettings({ fetch_interval: "0 */2 * * *" });
    const result = await getNextScheduledRunAt();
    expect(result).toBeInstanceOf(Date);
  });
});
