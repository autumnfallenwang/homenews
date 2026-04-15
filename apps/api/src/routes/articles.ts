import {
  type ArticleHighlight,
  type ArticleInteraction,
  createArticleHighlightSchema,
  type UpdateArticleInteraction,
  updateArticleInteractionSchema,
} from "@homenews/shared";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { articleHighlights, articleInteractions, articles } from "../db/schema.js";
import { embed } from "../services/embed.js";

const app = new Hono();

// Internal row shape returned by Drizzle SELECTs against article_interactions.
type InteractionRow = typeof articleInteractions.$inferSelect;

// Serialize a DB row (or null) into the public ArticleInteraction shape.
// Returns a synthetic default when the row is absent so the GET endpoint can
// always return a usable object without branching on presence.
function toResponse(articleId: string, row: InteractionRow | null): ArticleInteraction {
  if (!row) {
    return {
      id: null,
      articleId,
      userId: null,
      viewedAt: null,
      readAt: null,
      starred: false,
      note: null,
      userTags: [],
      followUp: false,
      readingSeconds: null,
      createdAt: null,
      updatedAt: null,
    };
  }
  return {
    id: row.id,
    articleId: row.articleId,
    userId: row.userId,
    viewedAt: row.viewedAt instanceof Date ? row.viewedAt.toISOString() : row.viewedAt,
    readAt: row.readAt instanceof Date ? row.readAt.toISOString() : row.readAt,
    starred: row.starred,
    note: row.note,
    userTags: row.userTags,
    followUp: row.followUp,
    readingSeconds: row.readingSeconds,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

// Verify the article exists. Returns true on hit, false on miss — callers
// should translate false into a 404 response.
async function articleExists(articleId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.id, articleId));
  return Boolean(row);
}

async function findInteraction(articleId: string): Promise<InteractionRow | null> {
  const [row] = await db
    .select()
    .from(articleInteractions)
    .where(and(eq(articleInteractions.articleId, articleId), isNull(articleInteractions.userId)));
  return row ?? null;
}

// Build a partial update set from a validated PATCH body. Only fields the
// client actually sent are included. `read: true/false` translates to a
// `readAt` Date or null. `updatedAt` is always set.
function buildUpdateSet(body: UpdateArticleInteraction): Record<string, unknown> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (body.read !== undefined) set.readAt = body.read ? new Date() : null;
  if (body.starred !== undefined) set.starred = body.starred;
  if (body.note !== undefined) set.note = body.note;
  if (body.userTags !== undefined) set.userTags = body.userTags;
  if (body.followUp !== undefined) set.followUp = body.followUp;
  if (body.readingSeconds !== undefined) set.readingSeconds = body.readingSeconds;
  return set;
}

// Build a full insert row from a PATCH body. Unset fields get sensible
// defaults that match the schema defaults.
function buildInsertValues(articleId: string, body: UpdateArticleInteraction) {
  return {
    articleId,
    userId: null,
    readAt: body.read ? new Date() : null,
    starred: body.starred ?? false,
    note: body.note ?? null,
    userTags: body.userTags ?? [],
    followUp: body.followUp ?? false,
    readingSeconds: body.readingSeconds ?? null,
  };
}

// ── GET /articles/:id/interaction ───────────────────────────
app.get("/:id/interaction", async (c) => {
  const id = c.req.param("id");

  if (!(await articleExists(id))) {
    return c.json({ error: "Article not found" }, 404);
  }

  const row = await findInteraction(id);
  return c.json(toResponse(id, row));
});

// ── PATCH /articles/:id/interaction ─────────────────────────
app.patch("/:id/interaction", async (c) => {
  const id = c.req.param("id");

  const body = await c.req.json().catch(() => null);
  const parsed = updateArticleInteractionSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return c.json({ error: "Validation failed", issues: parsed.error.issues }, 400);
  }

  if (!(await articleExists(id))) {
    return c.json({ error: "Article not found" }, 404);
  }

  const existing = await findInteraction(id);

  if (existing) {
    const [updated] = await db
      .update(articleInteractions)
      .set(buildUpdateSet(parsed.data))
      .where(eq(articleInteractions.id, existing.id))
      .returning();
    return c.json(toResponse(id, updated));
  }

  const [inserted] = await db
    .insert(articleInteractions)
    .values(buildInsertValues(id, parsed.data))
    .returning();
  return c.json(toResponse(id, inserted));
});

// ── POST /articles/:id/interaction/view ─────────────────────
// Lightweight auto-view tracker. Sets `viewedAt = now()` only the first
// time it's called for a given article; subsequent calls are no-ops on
// the timestamp (but still bump updatedAt so "last activity" stays fresh).
app.post("/:id/interaction/view", async (c) => {
  const id = c.req.param("id");

  if (!(await articleExists(id))) {
    return c.json({ error: "Article not found" }, 404);
  }

  const existing = await findInteraction(id);

  if (existing) {
    if (!existing.viewedAt) {
      await db
        .update(articleInteractions)
        .set({ viewedAt: new Date(), updatedAt: new Date() })
        .where(eq(articleInteractions.id, existing.id));
    }
  } else {
    await db.insert(articleInteractions).values({
      articleId: id,
      userId: null,
      viewedAt: new Date(),
    });
  }

  return c.json({ ok: true });
});

// ── Article highlights (Phase 14B) ─────────────────────────

type HighlightRow = typeof articleHighlights.$inferSelect;

function toHighlightResponse(row: HighlightRow): ArticleHighlight {
  return {
    id: row.id,
    articleId: row.articleId,
    userId: row.userId,
    text: row.text,
    note: row.note,
    charStart: row.charStart,
    charEnd: row.charEnd,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

// List highlights for an article, newest first.
app.get("/:id/highlights", async (c) => {
  const id = c.req.param("id");

  if (!(await articleExists(id))) {
    return c.json({ error: "Article not found" }, 404);
  }

  const rows = await db
    .select()
    .from(articleHighlights)
    .where(and(eq(articleHighlights.articleId, id), isNull(articleHighlights.userId)))
    .orderBy(desc(articleHighlights.createdAt));

  return c.json(rows.map(toHighlightResponse));
});

// Create a highlight on an article.
app.post("/:id/highlights", async (c) => {
  const id = c.req.param("id");

  const body = await c.req.json().catch(() => null);
  const parsed = createArticleHighlightSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return c.json({ error: "Validation failed", issues: parsed.error.issues }, 400);
  }

  if (!(await articleExists(id))) {
    return c.json({ error: "Article not found" }, 404);
  }

  // Phase 15 Task 90: embed the highlight text synchronously before the
  // INSERT so the vector lands in the same row. Best-effort — a failed
  // embedding logs + writes `null` so the highlight still persists.
  // Task 91 backfill picks up any highlights with null embedding.
  let embedding: number[] | null = null;
  try {
    embedding = await embed(parsed.data.text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[highlights] embedding failed for article ${id}: ${msg}`);
  }

  const [inserted] = await db
    .insert(articleHighlights)
    .values({
      articleId: id,
      userId: null,
      text: parsed.data.text,
      note: parsed.data.note ?? null,
      charStart: parsed.data.charStart ?? null,
      charEnd: parsed.data.charEnd ?? null,
      embedding,
    })
    .returning();

  return c.json(toHighlightResponse(inserted), 201);
});

export default app;
