import { log } from "../lib/logger.js";
import { db } from "./index.js";
import { feeds } from "./schema.js";

const starterFeeds = [
  { name: "OpenAI Blog", url: "https://openai.com/blog/rss.xml", category: "company" },
  { name: "Google AI Blog", url: "https://blog.google/technology/ai/rss/", category: "company" },
  { name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml", category: "company" },
  {
    name: "MIT Tech Review AI",
    url: "https://www.technologyreview.com/topic/artificial-intelligence/feed",
    category: "news",
  },
  { name: "Ars Technica AI", url: "https://arstechnica.com/ai/feed/", category: "news" },
  { name: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/", category: "news" },
  { name: "arXiv cs.AI", url: "https://rss.arxiv.org/rss/cs.AI", category: "research" },
  { name: "arXiv cs.CL", url: "https://rss.arxiv.org/rss/cs.CL", category: "research" },
  { name: "arXiv cs.LG", url: "https://rss.arxiv.org/rss/cs.LG", category: "research" },
];

async function seed() {
  log.info({ event: "seed.feeds.start", count: starterFeeds.length }, "seeding starter feeds");
  await db.insert(feeds).values(starterFeeds).onConflictDoNothing({ target: feeds.url });
  log.info({ event: "seed.feeds.done", count: starterFeeds.length }, "starter feeds seeded");
  process.exit(0);
}

seed().catch((err) => {
  log.error({ event: "seed.feeds.failed", err }, "starter-feeds seed failed");
  process.exit(1);
});
