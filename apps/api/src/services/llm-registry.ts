const DEFAULT_MODEL = "claude-haiku-4-5";

export interface LlmTaskConfig {
  name: string;
  description: string;
  systemPrompt: string;
  outputFormat: "json" | "text";
  model: string;
}

function resolveModel(envKey: string): string {
  return process.env[envKey] ?? process.env.LLM_MODEL ?? DEFAULT_MODEL;
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
    model: resolveModel("LLM_MODEL_SCORING"),
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
    model: resolveModel("LLM_MODEL_CLUSTERING"),
  },
  summarization: {
    name: "summarization",
    description: "Write 2-3 sentence article summaries",
    systemPrompt: `You are a news article summarizer for an AI/ML/tech news feed.
Write a concise 2-3 sentence summary of the article that captures the key points.
Respond ONLY with the summary text, no preamble or formatting.`,
    outputFormat: "text",
    model: resolveModel("LLM_MODEL_SUMMARIZATION"),
  },
};

export type LlmTaskName = keyof typeof llmTasks;

export function getTaskConfig(task: LlmTaskName): LlmTaskConfig {
  return llmTasks[task];
}
