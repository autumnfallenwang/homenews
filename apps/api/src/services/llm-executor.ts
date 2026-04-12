import { chatCompletion } from "./llm-client.js";
import {
  getFallbackModelForTask,
  getModelForTask,
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
  const primaryModel = await getModelForTask(task);
  const fallbackModel = await getFallbackModelForTask(task);
  const start = Date.now();

  let raw: string;
  let model = primaryModel;

  try {
    raw = await chatCompletion(prompt, {
      systemPrompt: config.systemPrompt,
      model: primaryModel,
    });
  } catch (err) {
    if (!fallbackModel || fallbackModel === primaryModel) throw err;

    console.warn(
      `[llm:${task}] Primary model ${primaryModel} failed, trying fallback ${fallbackModel}: ${err instanceof Error ? err.message : String(err)}`,
    );
    model = fallbackModel;
    raw = await chatCompletion(prompt, {
      systemPrompt: config.systemPrompt,
      model: fallbackModel,
    });
  }

  const durationMs = Date.now() - start;
  let parsed: unknown;

  if (config.outputFormat === "json") {
    parsed = extractJson(raw);
  }

  console.info(`[llm:${task}] model=${model} duration=${durationMs}ms ok`);

  return { raw, parsed, task, model, durationMs };
}
