# Personal News Intelligence System — Key Notes

## 1. Core Idea
- Build a **personal data ingestion + LLM reasoning pipeline**
- Separate:
  - **Input (wide, unbiased)**  
  - **Output (LLM-filtered, personalized)**

---

## 2. System Architecture

- Maximize **source diversity**
- Apply intelligence only at **post-processing**

---

## 3. Source Strategy

### Layer A — RSS (primary)
- Free, structured, stable
- No auth / no rate limits
- Ideal for ingestion

### Layer B — News APIs
- Supplemental (search, global coverage)
- Use free tier only

### Layer C — Open Web Signals
- Hacker News, Reddit, GitHub, arXiv
- Early signals before news

---

## 4. RSS — Key Understanding

### What it is
- Standardized feed of updates (title, link, timestamp)  [oai_citation:0‡RSS.app](https://rss.app/guides/what-is-rss/?utm_source=chatgpt.com)  

### Key properties
- Pull-based (you control fetch)
- No ranking / no algorithm  [oai_citation:1‡RSS.app](https://rss.app/guides/what-is-rss/?utm_source=chatgpt.com)  
- Structured + machine-readable

### Role in your system
> RSS = **raw input layer (no intelligence)**

---

## 5. Why RSS (for your case)
- No platform bias
- Clean data for LLM processing
- Zero cost
- Stable long-term infrastructure
- Works well with automation pipelines

---

## 6. Limitations of RSS
- Often partial content
- No deduplication
- No ranking
- Inconsistent formats
- Some sites don’t provide feeds

---

## 7. Key Design Principle

> ❗ Do NOT filter at ingestion

- Ingest broadly (RSS + others)
- Filter later with LLM

---

## 8. LLM Role (your advantage)
- Deduplication
- Clustering
- Importance scoring
- Summarization
- Insight generation

---

## 9. Ranking Strategy (high-level)
- Avoid LLM-only ranking

Use hybrid:
- Deterministic scoring (you control)
- LLM generates signals (not decisions)

---

## 10. Market Reality
- Existing tools:
  - Good at aggregation
  - Weak at user control
- Most systems:
  - Use hidden personalization
  - Optimize engagement, not insight

---

## 11. Your Differentiation

You are building:

> **User-controlled intelligence layer over unbiased data**

Instead of:
- algorithm feeds
- behavior-driven recommendations

---

## 12. MVP Direction

Phase 1:
- 20–50 RSS feeds
- simple ingestion + storage

Phase 2:
- dedup + clustering

Phase 3:
- ranking + custom output

---

## 13. Strategic Positioning

This is not:
- a news reader

This is:
> **Personal intelligence infrastructure**