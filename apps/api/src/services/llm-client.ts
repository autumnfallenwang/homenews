import OpenAI from "openai";

const gatewayUrl = process.env.LLM_GATEWAY_URL;

export const llm = new OpenAI({
  baseURL: gatewayUrl ? `${gatewayUrl}/v1` : undefined,
  apiKey: process.env.OPENAI_API_KEY ?? "not-needed",
});

const defaultModel = process.env.LLM_MODEL ?? "claude-haiku-4-5";

export async function chatCompletion(
  prompt: string,
  options?: { model?: string; systemPrompt?: string },
): Promise<string> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [];

  if (options?.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const model = options?.model ?? defaultModel;
  const isCodex = model.includes("codex") || model.startsWith("gpt-5");

  const response = await llm.chat.completions.create({
    model,
    messages,
    ...(isCodex ? {} : { temperature: 0.2 }),
  });

  return response.choices[0]?.message?.content ?? "";
}
