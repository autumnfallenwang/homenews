import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractArticle } from "../src/services/reader.js";

// Minimum-viable "article" fixture: a real <article> with enough paragraphs
// to satisfy Readability's length heuristic. Readability wants a few hundred
// characters of actual content before it'll accept a page as article-shaped.
const ARTICLE_HTML = `<!doctype html>
<html>
<head>
  <title>GPT-6 Released: Everything You Need To Know</title>
  <meta name="author" content="Jane Doe">
</head>
<body>
  <header><nav>site chrome</nav></header>
  <main>
    <article>
      <h1>GPT-6 Released: Everything You Need To Know</h1>
      <p>OpenAI announced GPT-6 today, marking a significant leap forward in
      large language model capabilities. The new model demonstrates improved
      reasoning, better instruction following, and substantially reduced
      hallucination rates across a range of established benchmarks.</p>
      <p>Early evaluations suggest GPT-6 outperforms its predecessor on MMLU,
      GPQA, and a new private evaluation suite designed to measure long-horizon
      agentic behavior. The model was trained on a mixture of public and
      licensed data with extensive red-teaming and constitutional oversight.</p>
      <p>In addition to raw capability improvements, OpenAI is rolling out a
      new safety classification layer that covers fourteen refusal categories
      and cuts jailbreak rates by roughly an order of magnitude compared to
      the previous generation of models.</p>
      <p>The release is gated behind a tiered access program. Researchers and
      selected enterprise partners will receive API access first, with broader
      availability expected within a few weeks pending additional evaluations.</p>
    </article>
  </main>
  <footer>site footer</footer>
</body>
</html>`;

const ARTICLE_WITH_SCRIPT = ARTICLE_HTML.replace(
  "<header>",
  "<script>window.__tracked = true; alert('xss');</script><header>",
);

const ARTICLE_WITH_FIGURE = ARTICLE_HTML.replace(
  "<p>The release is gated",
  `<figure><img src="https://example.com/chart.png" alt="Benchmark chart"><figcaption>Caption: benchmark results across MMLU and GPQA.</figcaption></figure><p>The release is gated`,
);

// Truly empty page — no <article>, no paragraphs, no heuristic-worthy
// content. Readability returns null for this because there's nothing to
// extract.
const NOT_ARTICLE_HTML = `<!doctype html><html><head><title>empty</title></head><body></body></html>`;

// Build a minimal Response-like object the SUT can consume.
function mockResponse(html: string, init?: { status?: number; statusText?: string }): Response {
  return {
    ok: (init?.status ?? 200) < 400,
    status: init?.status ?? 200,
    statusText: init?.statusText ?? "OK",
    text: () => Promise.resolve(html),
  } as unknown as Response;
}

describe("extractArticle", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("extracts a clean article from well-formed HTML", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(ARTICLE_HTML));

    const result = await extractArticle("https://example.com/gpt6");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.title).toContain("GPT-6");
    expect(result.content).toContain("OpenAI announced GPT-6");
    expect(result.length).toBeGreaterThan(300);
    expect(result.excerpt).toBeTruthy();
    expect(result.extractedAt).toBeInstanceOf(Date);
  });

  it("strips script tags before parsing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(ARTICLE_WITH_SCRIPT));

    const result = await extractArticle("https://example.com/gpt6");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).not.toContain("<script");
    expect(result.content).not.toContain("alert(");
    expect(result.textContent).not.toContain("alert");
  });

  it("preserves images and figures in extracted content", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(ARTICLE_WITH_FIGURE));

    const result = await extractArticle("https://example.com/gpt6");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain("<img");
    expect(result.content).toContain("chart.png");
    expect(result.content).toContain("Caption: benchmark results");
  });

  it("returns failure on HTTP 404", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockResponse("", { status: 404, statusText: "Not Found" }));

    const result = await extractArticle("https://example.com/missing");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.httpStatus).toBe(404);
    expect(result.error).toContain("HTTP 404");
  });

  it("returns failure on HTTP 500", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockResponse("", { status: 500, statusText: "Server Error" }));

    const result = await extractArticle("https://example.com/boom");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.httpStatus).toBe(500);
    expect(result.error).toContain("HTTP 500");
  });

  it("returns failure on network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    const result = await extractArticle("https://example.com/unreachable");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.startsWith("fetch failed:")).toBe(true);
  });

  it("returns failure on timeout / abort", async () => {
    const err = new DOMException("signal timed out", "TimeoutError");
    globalThis.fetch = vi.fn().mockRejectedValue(err);

    const result = await extractArticle("https://example.com/slow");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.startsWith("fetch failed:")).toBe(true);
    expect(result.error).toContain("timed out");
  });

  it("returns failure when Readability returns null", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(NOT_ARTICLE_HTML));

    const result = await extractArticle("https://example.com/tiny");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toContain("readability");
  });

  it("populates textContent as plain text", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(ARTICLE_HTML));

    const result = await extractArticle("https://example.com/gpt6");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.textContent).toContain("OpenAI announced GPT-6");
    expect(result.textContent).not.toContain("<p>");
    expect(result.textContent).not.toContain("<article");
  });

  it("fetches with a desktop browser user agent", async () => {
    const spy = vi.fn().mockResolvedValue(mockResponse(ARTICLE_HTML));
    globalThis.fetch = spy;

    await extractArticle("https://example.com/gpt6");

    expect(spy).toHaveBeenCalledTimes(1);
    const [, init] = spy.mock.calls[0];
    expect(init).toBeDefined();
    const ua = (init.headers as Record<string, string>)["user-agent"];
    expect(ua).toMatch(/^Mozilla\/5\.0/);
  });

  it("passes redirect: follow to fetch", async () => {
    const spy = vi.fn().mockResolvedValue(mockResponse(ARTICLE_HTML));
    globalThis.fetch = spy;

    await extractArticle("https://example.com/gpt6");

    const [, init] = spy.mock.calls[0];
    expect(init.redirect).toBe("follow");
    expect(init.signal).toBeDefined();
  });
});
