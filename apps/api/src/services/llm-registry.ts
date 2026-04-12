import { getSetting } from "./settings.js";

export interface LlmTaskConfig {
  name: string;
  description: string;
  /** Static system prompt, used as-is. Use for prompts without dynamic values. */
  systemPrompt?: string;
  /** System prompt template with `{{PLACEHOLDER}}` substitutions, resolved via getSystemPrompt(). */
  systemPromptTemplate?: string;
  outputFormat: "json" | "text";
}

export const llmTasks: Record<string, LlmTaskConfig> = {
  analyze: {
    name: "analyze",
    description: "Classify article: relevance, importance, and tags from controlled vocabulary",
    systemPromptTemplate: `You are a news article analyzer for an AI/ML/tech news feed.
For each article, produce three classifications:
1. relevance (0-100): how related this article is to AI, machine learning, or technology
2. importance (0-100): how significant/impactful the news is — breakthrough (90+), major release (70+), incremental update (40+), minor/tutorial (<40)
3. tags: pick 1-5 from the allowed list below. Do NOT invent new tags outside the list.

Allowed tags: {{ALLOWED_TAGS}}

Respond ONLY with valid JSON in this exact format:
{"relevance": <number 0-100>, "importance": <number 0-100>, "tags": [<string tags from allowed list>]}`,
    outputFormat: "json",
  },
  summarize: {
    name: "summarize",
    description: "Write 2-3 sentence article summaries",
    systemPrompt: `You are a news article summarizer for an AI/ML/tech news feed.
Write a concise 2-3 sentence summary of the article that captures the key points.
Respond ONLY with the summary text, no preamble or formatting.`,
    outputFormat: "text",
  },
};

export type LlmTaskName = keyof typeof llmTasks;

export function getTaskConfig(task: LlmTaskName): LlmTaskConfig {
  return llmTasks[task];
}

/**
 * Resolve the system prompt for a task. Static prompts are returned as-is.
 * Template prompts have placeholders substituted from settings at call time.
 *
 * Supported placeholders:
 * - `{{ALLOWED_TAGS}}` — replaced with the comma-separated list from `allowed_tags` setting
 */
export async function getSystemPrompt(task: LlmTaskName): Promise<string> {
  const config = llmTasks[task];
  if (!config) throw new Error(`Unknown LLM task: ${task}`);

  if (config.systemPrompt) {
    return config.systemPrompt;
  }

  if (config.systemPromptTemplate) {
    let prompt = config.systemPromptTemplate;

    if (prompt.includes("{{ALLOWED_TAGS}}")) {
      const tags = await getSetting<string[]>("allowed_tags");
      prompt = prompt.replace("{{ALLOWED_TAGS}}", tags.join(", "));
    }

    return prompt;
  }

  throw new Error(`Task "${task}" has neither systemPrompt nor systemPromptTemplate`);
}

/**
 * Get the primary model for a task from the settings table.
 * Key format: `llm_model_<task>` (e.g. `llm_model_analyze`).
 */
export function getModelForTask(task: LlmTaskName): Promise<string> {
  return getSetting<string>(`llm_model_${task}`);
}

/**
 * Get the fallback model for a task from the settings table.
 * Returns null if no fallback is configured.
 */
export async function getFallbackModelForTask(task: LlmTaskName): Promise<string | null> {
  try {
    return await getSetting<string>(`llm_model_${task}_fallback`);
  } catch {
    return null;
  }
}
