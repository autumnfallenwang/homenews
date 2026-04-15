// Phase 15 — embedding service.
//
// Thin wrapper around the llm-gateway's OpenAI-compatible /embeddings
// endpoint. Model name is read from settings on every call (hot-swappable
// via the settings UI), same pattern as analyze/summarize model selection.
//
// Callers (analyze pipeline integration in Task 89, highlight POST in
// Task 90) decide how to handle failures — embed() throws on error, and
// those call sites wrap in try/catch so a failed embedding doesn't kill
// the whole batch.

import { llm } from "./llm-client.js";
import { getSetting } from "./settings.js";

const EMBEDDING_MODEL_SETTING = "embedding_model_name";
const DEFAULT_MODEL = "bge-m3";

async function getModel(): Promise<string> {
  try {
    return await getSetting<string>(EMBEDDING_MODEL_SETTING);
  } catch {
    // Settings not seeded yet or key missing — fall back to the default
    // so the first pipeline run after deploy can still proceed.
    return DEFAULT_MODEL;
  }
}

export async function embed(text: string): Promise<number[]> {
  const model = await getModel();
  const startedAt = Date.now();

  try {
    const response = await llm.embeddings.create({
      model,
      input: text,
    });
    const vector = response.data[0]?.embedding;
    if (!vector) {
      throw new Error("embeddings.create returned no data");
    }
    const durationMs = Date.now() - startedAt;
    console.info(`[embed] ok chars=${text.length} dims=${vector.length} ms=${durationMs}`);
    return vector;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[embed] fail chars=${text.length} error=${msg}`);
    throw err;
  }
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const model = await getModel();
  const startedAt = Date.now();
  const totalChars = texts.reduce((sum, t) => sum + t.length, 0);

  try {
    const response = await llm.embeddings.create({
      model,
      input: texts,
    });
    // OpenAI guarantees response.data is in the same order as the input
    // array, but sort by index for defensive safety.
    const sorted = [...response.data].sort((a, b) => a.index - b.index);
    const vectors = sorted.map((d) => d.embedding);
    if (vectors.length !== texts.length) {
      throw new Error(`embedBatch: got ${vectors.length} vectors for ${texts.length} inputs`);
    }
    const durationMs = Date.now() - startedAt;
    console.info(
      `[embed] batch ok n=${texts.length} chars=${totalChars} dims=${vectors[0]?.length ?? 0} ms=${durationMs}`,
    );
    return vectors;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[embed] batch fail n=${texts.length} chars=${totalChars} error=${msg}`);
    throw err;
  }
}
