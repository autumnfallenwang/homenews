"use client";

import { useId, useState } from "react";
import { updateArticleInteraction } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ArticleTagsRowProps {
  articleId: string;
  llmTags: string[];
  initialUserTags: string[];
  availableTags: string[];
}

// One merged, editable tag row. LLM tags render first in original order,
// then user tags that aren't already duplicated by an LLM tag. Chips look
// visually identical — the user can't (and needn't) tell which is which.
// The × remove affordance only appears on chips sourced from userTags alone;
// duplicates (tag present in both) show as a single read-only chip because
// removing the user side wouldn't clear the LLM side from the display.
export function ArticleTagsRow({
  articleId,
  llmTags,
  initialUserTags,
  availableTags,
}: ArticleTagsRowProps) {
  const [userTags, setUserTags] = useState<string[]>(initialUserTags);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const listId = useId();

  const llmSet = new Set(llmTags);
  // User tags that aren't already covered by an LLM tag — these are the
  // only ones with a × remove button. Preserves order of userTags.
  const userOnly = userTags.filter((t) => !llmSet.has(t));

  // Autocomplete = allowed vocab + previously-used user tags, minus what's
  // already on this article (LLM or user).
  const allOnArticle = new Set([...llmTags, ...userTags]);
  const suggestions = Array.from(new Set([...availableTags, ...userTags]))
    .filter((t) => !allOnArticle.has(t))
    .sort();

  async function patchTags(next: string[]) {
    setSaving(true);
    try {
      const updated = await updateArticleInteraction(articleId, { userTags: next });
      setUserTags(updated.userTags);
    } catch {
      // Leave local state unchanged on failure; user can retry
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    if (allOnArticle.has(tag)) {
      setDraft("");
      return;
    }
    setDraft("");
    await patchTags([...userTags, tag]);
  }

  async function handleRemove(tag: string) {
    await patchTags(userTags.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {llmTags.map((tag) => (
        <Chip key={`llm-${tag}`} label={tag} />
      ))}
      {userOnly.map((tag) => (
        <Chip key={`user-${tag}`} label={tag} onRemove={() => handleRemove(tag)} />
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void handleAdd(draft);
          } else if (e.key === "Escape") {
            setDraft("");
          }
        }}
        placeholder="+ add tag"
        list={listId}
        className="border border-border bg-background/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none"
      />
      <datalist id={listId}>
        {suggestions.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
      {saving && (
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          saving…
        </span>
      )}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span
      className={cn(
        "group inline-flex items-center gap-1 rounded-sm border border-border bg-card/40 px-1.5 py-0.5 font-mono text-[10px] lowercase tracking-wide text-muted-foreground",
        onRemove && "pr-1",
      )}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="opacity-0 text-[11px] leading-none text-muted-foreground/60 transition-opacity hover:text-destructive group-hover:opacity-100"
          aria-label={`Remove ${label}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
