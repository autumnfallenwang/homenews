import type Parser from "rss-parser";
import type { articles } from "../db/schema.js";

type ArticleInsert = typeof articles.$inferInsert;

export function mapRssItem(feedId: string, item: Parser.Item): ArticleInsert {
  return {
    feedId,
    title: item.title ?? "(untitled)",
    link: item.link ?? item.guid ?? "",
    summary: item.contentSnippet ?? null,
    content: item.content ?? null,
    author: item.creator ?? null,
    publishedAt: item.isoDate ? new Date(item.isoDate) : null,
  };
}
