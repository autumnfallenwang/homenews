import { z } from "zod/v4";

export const healthResponseSchema = z.object({
  status: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const feedSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  url: z.url(),
  category: z.string().nullable(),
  enabled: z.boolean(),
  lastFetchedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type Feed = z.infer<typeof feedSchema>;

export const createFeedSchema = z.object({
  name: z.string().min(1),
  url: z.url(),
  category: z.string().optional(),
  enabled: z.boolean().optional(),
});

export type CreateFeed = z.infer<typeof createFeedSchema>;

export const updateFeedSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.url().optional(),
  category: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

export type UpdateFeed = z.infer<typeof updateFeedSchema>;

export const articleSchema = z.object({
  id: z.string().uuid(),
  feedId: z.string().uuid(),
  title: z.string(),
  link: z.url(),
  summary: z.string().nullable(),
  content: z.string().nullable(),
  author: z.string().nullable(),
  publishedAt: z.string().nullable(),
  fetchedAt: z.string(),
});

export type Article = z.infer<typeof articleSchema>;
