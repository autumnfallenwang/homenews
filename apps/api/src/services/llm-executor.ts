import { chatCompletion } from "./llm-client.js";
import { getTaskConfig, type LlmTaskName } from "./llm-registry.js";

const fallbackModel = process.env.LLM_FALLBACK_MODEL;

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
  const start = Date.now();

  let raw: string;
  let model = config.model;

  try {
    raw = await chatCompletion(prompt, {
      systemPrompt: config.systemPrompt,
      model: config.model,
    });
  } catch (err) {
    if (!fallbackModel || fallbackModel === config.model) throw err;

    console.warn(
      `[llm:${task}] Primary model ${config.model} failed, trying fallback ${fallbackModel}: ${err instanceof Error ? err.message : String(err)}`,
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
