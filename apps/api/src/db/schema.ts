import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const feeds = pgTable("feeds", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  url: text("url").notNull().unique(),
  category: text("category"),
  enabled: boolean("enabled").notNull().default(true),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const articles = pgTable("articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  feedId: uuid("feed_id")
    .notNull()
    .references(() => feeds.id),
  title: text("title").notNull(),
  link: text("link").notNull().unique(),
  summary: text("summary"),
  content: text("content"),
  author: text("author"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});
