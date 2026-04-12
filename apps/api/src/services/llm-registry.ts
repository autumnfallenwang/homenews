import { getSetting } from "./settings.js";

export interface LlmTaskConfig {
  name: string;
  description: string;
  systemPrompt: string;
  outputFormat: "json" | "text";
}

export const llmTasks: Record<string, LlmTaskConfig> = {
  scoring: {
    name: "scoring",
    description: "Rate article relevance to AI/ML/tech (0-100)",
    systemPrompt: `You are a news relevance scorer for an AI/ML/tech news feed.
Rate each article's relevance to AI, machine learning, and technology on a scale of 0-100.
Respond ONLY with valid JSON in this exact format:
{"score": <number 0-100>, "tags": [<string tags>], "reasoning": "<brief explanation>"}`,
    outputFormat: "json",
  },
  clustering: {
    name: "clustering",
    description: "Group related articles into topic clusters",
    systemPrompt: `You are a news article clustering assistant.
Given a list of article IDs and titles, group related articles into clusters.
Each cluster should have a short descriptive label (2-5 words).
Respond ONLY with valid JSON in this exact format:
{"clusters": {"article_id": "Cluster Label", "article_id2": "Cluster Label", ...}}
Every article must be assigned to exactly one cluster. Articles that don't fit any group get their own unique cluster label.`,
    outputFormat: "json",
  },
  summarization: {
    name: "summarization",
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
 * Get the primary model for a task from the settings table.
 * Key format: `llm_model_<task>` (e.g. `llm_model_scoring`).
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
