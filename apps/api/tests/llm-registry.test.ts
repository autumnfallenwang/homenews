import { describe, expect, it, vi } from "vitest";

const getSettingMock = vi.fn();
vi.mock("../src/services/settings.js", () => ({
  getSetting: (key: string) => getSettingMock(key),
}));

import {
  getFallbackModelForTask,
  getModelForTask,
  getTaskConfig,
  llmTasks,
} from "../src/services/llm-registry.js";

describe("llmTasks", () => {
  const taskNames = Object.keys(llmTasks) as (keyof typeof llmTasks)[];

  it("has scoring, clustering, and summarization tasks", () => {
    expect(taskNames).toContain("scoring");
    expect(taskNames).toContain("clustering");
    expect(taskNames).toContain("summarization");
  });

  for (const name of taskNames) {
    describe(`task: ${name}`, () => {
      const config = llmTasks[name];

      it("has a non-empty name", () => {
        expect(config.name).toBe(name);
      });

      it("has a non-empty description", () => {
        expect(config.description.length).toBeGreaterThan(0);
      });

      it("has a non-empty systemPrompt", () => {
        expect(config.systemPrompt.length).toBeGreaterThan(0);
      });

      it("has a valid outputFormat", () => {
        expect(["json", "text"]).toContain(config.outputFormat);
      });
    });
  }
});

describe("getTaskConfig", () => {
  it("returns scoring config", () => {
    const config = getTaskConfig("scoring");
    expect(config.name).toBe("scoring");
    expect(config.outputFormat).toBe("json");
    expect(config.systemPrompt).toContain("relevance");
  });

  it("returns clustering config", () => {
    const config = getTaskConfig("clustering");
    expect(config.name).toBe("clustering");
    expect(config.outputFormat).toBe("json");
    expect(config.systemPrompt).toContain("clusters");
  });

  it("returns summarization config", () => {
    const config = getTaskConfig("summarization");
    expect(config.name).toBe("summarization");
    expect(config.outputFormat).toBe("text");
    expect(config.systemPrompt).toContain("summary");
  });
});

// biome-ignore lint/security/noSecrets: false positive on function name
describe("getModelForTask", () => {
  it("reads llm_model_scoring setting for scoring task", async () => {
    getSettingMock.mockResolvedValueOnce("gpt-5.3-codex");
    const model = await getModelForTask("scoring");
    expect(model).toBe("gpt-5.3-codex");
    expect(getSettingMock).toHaveBeenCalledWith("llm_model_scoring");
  });

  it("reads llm_model_summarization setting for summarization task", async () => {
    getSettingMock.mockResolvedValueOnce("gemma3:27b");
    const model = await getModelForTask("summarization");
    expect(model).toBe("gemma3:27b");
    expect(getSettingMock).toHaveBeenCalledWith("llm_model_summarization");
  });
});

describe("getFallbackModelForTask", () => {
  it("reads llm_model_scoring_fallback setting", async () => {
    getSettingMock.mockResolvedValueOnce("gemma3:27b");
    const model = await getFallbackModelForTask("scoring");
    expect(model).toBe("gemma3:27b");
    expect(getSettingMock).toHaveBeenCalledWith("llm_model_scoring_fallback");
  });

  it("returns null when fallback setting is missing", async () => {
    getSettingMock.mockRejectedValueOnce(new Error("Unknown setting key"));
    const model = await getFallbackModelForTask("scoring");
    expect(model).toBeNull();
  });
});
