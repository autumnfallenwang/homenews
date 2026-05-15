import { log } from "../lib/logger.js";
import { chatCompletion } from "./llm-client.js";
import {
  getFallbackModelForTask,
  getModelForTask,
  getSystemPrompt,
  getTaskConfig,
  type LlmTaskName,
} from "./llm-registry.js";

export interface LlmExecuteResult {
  raw: string;
  parsed?: unknown;
  task: string;
  model: string;
  durationMs: number;
}

export function extractJson(response: string): unknown {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in LLM response");
  }
  return JSON.parse(jsonMatch[0]);
}

export async function llmExecute(task: LlmTaskName, prompt: string): Promise<LlmExecuteResult> {
  const config = getTaskConfig(task);
  const systemPrompt = await getSystemPrompt(task);
  const primaryModel = await getModelForTask(task);
  const fallbackModel = await getFallbackModelForTask(task);
  const start = Date.now();

  let raw: string;
  let model = primaryModel;

  try {
    raw = await chatCompletion(prompt, { systemPrompt, model: primaryModel });
  } catch (err) {
    if (!fallbackModel || fallbackModel === primaryModel) throw err;

    log.warn(
      {
        event: "llm.fallback.used",
        task,
        primary_model: primaryModel,
        fallback_model: fallbackModel,
        err: err instanceof Error ? err : new Error(String(err)),
      },
      "primary LLM failed, retrying with fallback model",
    );
    model = fallbackModel;
    raw = await chatCompletion(prompt, { systemPrompt, model: fallbackModel });
  }

  const durationMs = Date.now() - start;
  let parsed: unknown;

  if (config.outputFormat === "json") {
    parsed = extractJson(raw);
  }

  log.info({ event: "llm.ok", task, model, duration_ms: durationMs }, "LLM call succeeded");

  return { raw, parsed, task, model, durationMs };
}
