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

import { log } from "../lib/logger.js";
import { llm } from "./llm-client.js";
import { getSetting } from "./settings.js";

const EMBEDDING_MODEL_SETTING = "embedding_model_name";
const EMBEDDING_FALLBACK_SETTING = "embedding_model_name_fallback";
const DEFAULT_MODEL = "bge-m3:latest";

async function getModel(): Promise<string> {
  try {
    return await getSetting<string>(EMBEDDING_MODEL_SETTING);
  } catch {
    // Settings not seeded yet or key missing — fall back to the default
    // so the first pipeline run after deploy can still proceed.
    return DEFAULT_MODEL;
  }
}

async function getFallbackModel(): Promise<string | null> {
  try {
    const v = await getSetting<string>(EMBEDDING_FALLBACK_SETTING);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

async function callEmbed(model: string, input: string | string[]): Promise<number[][]> {
  const response = await llm.embeddings.create({ model, input });
  // OpenAI guarantees response.data is in the same order as the input
  // array, but sort by index for defensive safety.
  const sorted = [...response.data].sort((a, b) => a.index - b.index);
  const vectors = sorted.map((d) => d.embedding);
  return vectors;
}

export async function embed(text: string): Promise<number[]> {
  const primary = await getModel();
  const fallback = await getFallbackModel();
  const startedAt = Date.now();

  let model = primary;
  try {
    let vectors: number[][];
    try {
      vectors = await callEmbed(primary, text);
    } catch (err) {
      if (!fallback || fallback === primary) throw err;
      log.warn(
        {
          event: "embed.fallback.used",
          primary_model: primary,
          fallback_model: fallback,
          err: err instanceof Error ? err : new Error(String(err)),
        },
        "primary embedding failed, retrying with fallback model",
      );
      model = fallback;
      vectors = await callEmbed(fallback, text);
    }
    const vector = vectors[0];
    if (!vector) {
      throw new Error("embeddings.create returned no data");
    }
    const durationMs = Date.now() - startedAt;
    log.info(
      {
        event: "embed.ok",
        model,
        chars: text.length,
        dims: vector.length,
        duration_ms: durationMs,
      },
      "embedding succeeded",
    );
    return vector;
  } catch (err) {
    log.warn(
      {
        event: "embed.fail",
        model,
        chars: text.length,
        err: err instanceof Error ? err : new Error(String(err)),
      },
      "embedding failed",
    );
    throw err;
  }
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const primary = await getModel();
  const fallback = await getFallbackModel();
  const startedAt = Date.now();
  const totalChars = texts.reduce((sum, t) => sum + t.length, 0);

  let model = primary;
  try {
    let vectors: number[][];
    try {
      vectors = await callEmbed(primary, texts);
    } catch (err) {
      if (!fallback || fallback === primary) throw err;
      log.warn(
        {
          event: "embed.batch.fallback.used",
          primary_model: primary,
          fallback_model: fallback,
          batch_size: texts.length,
          err: err instanceof Error ? err : new Error(String(err)),
        },
        "primary embedding batch failed, retrying with fallback model",
      );
      model = fallback;
      vectors = await callEmbed(fallback, texts);
    }
    if (vectors.length !== texts.length) {
      throw new Error(`embedBatch: got ${vectors.length} vectors for ${texts.length} inputs`);
    }
    const durationMs = Date.now() - startedAt;
    log.info(
      {
        event: "embed.batch.ok",
        model,
        batch_size: texts.length,
        chars: totalChars,
        dims: vectors[0]?.length ?? 0,
        duration_ms: durationMs,
      },
      "embedding batch succeeded",
    );
    return vectors;
  } catch (err) {
    log.warn(
      {
        event: "embed.batch.fail",
        model,
        batch_size: texts.length,
        chars: totalChars,
        err: err instanceof Error ? err : new Error(String(err)),
      },
      "embedding batch failed",
    );
    throw err;
  }
}
