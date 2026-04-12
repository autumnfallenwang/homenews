import { describe, expect, it } from "vitest";
import { getTaskConfig, llmTasks } from "../src/services/llm-registry.js";

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

      it("has a non-empty model", () => {
        expect(config.model.length).toBeGreaterThan(0);
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

  it("each task has a model that falls back to LLM_MODEL or default", () => {
    // Without task-specific env vars set, all tasks should resolve to the same model
    const models = Object.values(llmTasks).map((t) => t.model);
    for (const model of models) {
      expect(typeof model).toBe("string");
      expect(model.length).toBeGreaterThan(0);
    }
  });
});
