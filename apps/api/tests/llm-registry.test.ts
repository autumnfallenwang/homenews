import { describe, expect, it, vi } from "vitest";

const getSettingMock = vi.fn();
vi.mock("../src/services/settings.js", () => ({
  getSetting: (key: string) => getSettingMock(key),
}));

import {
  getFallbackModelForTask,
  getModelForTask,
  getSystemPrompt,
  getTaskConfig,
  llmTasks,
} from "../src/services/llm-registry.js";

describe("llmTasks", () => {
  const taskNames = Object.keys(llmTasks) as (keyof typeof llmTasks)[];

  it("has analyze and summarize tasks only", () => {
    expect(taskNames.sort()).toEqual(["analyze", "summarize"]);
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

      it("has either a static prompt or a template", () => {
        const hasStatic = !!config.systemPrompt && config.systemPrompt.length > 0;
        const hasTemplate = !!config.systemPromptTemplate && config.systemPromptTemplate.length > 0;
        expect(hasStatic || hasTemplate).toBe(true);
      });

      it("has a valid outputFormat", () => {
        expect(["json", "text"]).toContain(config.outputFormat);
      });
    });
  }
});

describe("getTaskConfig", () => {
  it("returns analyze config with template", () => {
    const config = getTaskConfig("analyze");
    expect(config.name).toBe("analyze");
    expect(config.outputFormat).toBe("json");
    expect(config.systemPromptTemplate).toContain("{{ALLOWED_TAGS}}");
  });

  it("returns summarize config", () => {
    const config = getTaskConfig("summarize");
    expect(config.name).toBe("summarize");
    expect(config.outputFormat).toBe("text");
    expect(config.systemPrompt).toContain("summary");
  });
});

describe("getSystemPrompt", () => {
  it("returns static prompt unchanged for summarize task", async () => {
    const prompt = await getSystemPrompt("summarize");
    expect(prompt).toContain("summarizer");
    expect(prompt).not.toContain("{{");
  });

  it("resolves {{ALLOWED_TAGS}} placeholder for analyze task", async () => {
    getSettingMock.mockResolvedValueOnce(["ai-research", "model-release", "openai"]);
    const prompt = await getSystemPrompt("analyze");
    expect(prompt).toContain("ai-research, model-release, openai");
    expect(prompt).not.toContain("{{ALLOWED_TAGS}}");
    expect(getSettingMock).toHaveBeenCalledWith("allowed_tags");
  });

  it("analyze prompt includes classification instructions", async () => {
    getSettingMock.mockResolvedValueOnce(["ai"]);
    const prompt = await getSystemPrompt("analyze");
    expect(prompt).toContain("relevance");
    expect(prompt).toContain("importance");
    expect(prompt).toContain("tags");
  });
});

// biome-ignore lint/security/noSecrets: false positive on function name
describe("getModelForTask", () => {
  it("reads llm_model_analyze setting for analyze task", async () => {
    getSettingMock.mockResolvedValueOnce("gpt-5.1-codex-mini");
    const model = await getModelForTask("analyze");
    expect(model).toBe("gpt-5.1-codex-mini");
    expect(getSettingMock).toHaveBeenCalledWith("llm_model_analyze");
  });

  it("reads llm_model_summarize setting for summarize task", async () => {
    getSettingMock.mockResolvedValueOnce("gpt-5.3-codex");
    const model = await getModelForTask("summarize");
    expect(model).toBe("gpt-5.3-codex");
    expect(getSettingMock).toHaveBeenCalledWith("llm_model_summarize");
  });
});

describe("getFallbackModelForTask", () => {
  it("reads llm_model_analyze_fallback setting", async () => {
    getSettingMock.mockResolvedValueOnce("gemma3:27b");
    const model = await getFallbackModelForTask("analyze");
    expect(model).toBe("gemma3:27b");
    expect(getSettingMock).toHaveBeenCalledWith("llm_model_analyze_fallback");
  });

  it("returns null when fallback setting is missing", async () => {
    getSettingMock.mockRejectedValueOnce(new Error("Unknown setting key"));
    const model = await getFallbackModelForTask("analyze");
    expect(model).toBeNull();
  });
});
