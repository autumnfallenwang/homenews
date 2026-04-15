// Phase 14 — Reader mode extraction service.
//
// Wraps @mozilla/readability + jsdom to turn a remote URL into cleaned HTML
// suitable for inline rendering in the HomeNews article detail page. Pure
// single-call interface; no DB writes here (that lives at the pipeline
// integration point in Task 71). Every failure mode returns a resolved
// ExtractionFailure — no thrown errors escape this function.
//
// Validated against 8/8 diverse production sources in poc/reader-extract/.

import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";

// Desktop Safari user agent. Several sources (MIT Tech Review, NVIDIA) return
// SPA shells or 403s to unrecognized user agents; impersonating a real browser
// keeps the success rate high. This is the same UA the POC used.
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const FETCH_TIMEOUT_MS = 10_000;

export interface ExtractionSuccess {
  ok: true;
  content: string;
  textContent: string;
  title: string | null;
  byline: string | null;
  siteName: string | null;
  excerpt: string | null;
  length: number;
  extractedAt: Date;
}

export interface ExtractionFailure {
  ok: false;
  error: string;
  httpStatus?: number;
  extractedAt: Date;
}

export type ExtractionResult = ExtractionSuccess | ExtractionFailure;

// Defense-in-depth script stripping before jsdom parses the document.
// jsdom's default `scriptingEnabled: false` means scripts wouldn't execute
// anyway, but stripping up-front keeps Readability from treating script
// blocks as article noise and speeds up the parse.
function stripScripts(html: string): string {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
}

export async function extractArticle(url: string): Promise<ExtractionResult> {
  const extractedAt = new Date();
  const startedAt = Date.now();

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "user-agent": DESKTOP_UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const error = `fetch failed: ${msg}`;
    console.warn(`[reader] fail url=${url} error=${error}`);
    return { ok: false, error, extractedAt };
  }

  if (!res.ok) {
    const error = `HTTP ${res.status} ${res.statusText}`;
    console.warn(`[reader] fail url=${url} error=${error}`);
    return { ok: false, error, httpStatus: res.status, extractedAt };
  }

  let html: string;
  try {
    html = await res.text();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const error = `body read failed: ${msg}`;
    console.warn(`[reader] fail url=${url} error=${error}`);
    return { ok: false, error, httpStatus: res.status, extractedAt };
  }

  const cleaned = stripScripts(html);

  // Silence jsdom's verbose warnings about unsupported CSS, invalid markup,
  // and similar noise that real-world pages always produce.
  const noop = () => {
    /* drop jsdom diagnostics */
  };
  const vc = new VirtualConsole();
  vc.on("error", noop);
  vc.on("warn", noop);
  vc.on("jsdomError", noop);

  let dom: JSDOM;
  try {
    dom = new JSDOM(cleaned, { url, virtualConsole: vc });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const error = `jsdom parse failed: ${msg}`;
    console.warn(`[reader] fail url=${url} error=${error}`);
    return { ok: false, error, httpStatus: res.status, extractedAt };
  }

  let article: ReturnType<Readability["parse"]>;
  try {
    const reader = new Readability(dom.window.document);
    article = reader.parse();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const error = `readability parse failed: ${msg}`;
    console.warn(`[reader] fail url=${url} error=${error}`);
    return { ok: false, error, httpStatus: res.status, extractedAt };
  }

  if (!article?.content) {
    const error = "Readability returned null — no article-shaped content found";
    console.warn(`[reader] fail url=${url} error=${error}`);
    return { ok: false, error, httpStatus: res.status, extractedAt };
  }

  const textContent = article.textContent ?? "";
  const length = article.length ?? textContent.length;
  const durationMs = Date.now() - startedAt;
  console.info(`[reader] ok url=${url} chars=${length} ms=${durationMs}`);

  return {
    ok: true,
    content: article.content,
    textContent,
    title: article.title ?? null,
    byline: article.byline ?? null,
    siteName: article.siteName ?? null,
    excerpt: article.excerpt ?? null,
    length,
    extractedAt,
  };
}
