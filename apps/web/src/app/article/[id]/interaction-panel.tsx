"use client";

import type { ArticleInteraction, UpdateArticleInteraction } from "@homenews/shared";
import { useEffect, useState } from "react";
import { trackArticleView, updateArticleInteraction } from "@/lib/api";
import { cn } from "@/lib/utils";

interface InteractionPanelProps {
  articleId: string;
  initialInteraction: ArticleInteraction;
}

type SavingField = "star" | "read" | "followUp" | "note" | null;

export function InteractionPanel({ articleId, initialInteraction }: InteractionPanelProps) {
  const [interaction, setInteraction] = useState<ArticleInteraction>(initialInteraction);
  const [saving, setSaving] = useState<SavingField>(null);
  const [noteDraft, setNoteDraft] = useState<string>(initialInteraction.note ?? "");

  // Auto-track view once on mount. Fire and forget — network errors are
  // silently ignored so a broken API doesn't crash the detail page.
  useEffect(() => {
    trackArticleView(articleId).catch(() => {});
  }, [articleId]);

  async function patch(body: UpdateArticleInteraction, label: SavingField) {
    setSaving(label);
    try {
      const updated = await updateArticleInteraction(articleId, body);
      setInteraction(updated);
    } catch {
      // Leave local state unchanged on failure; user can retry
    } finally {
      setSaving(null);
    }
  }

  const isRead = Boolean(interaction.readAt);
  const isStarred = interaction.starred;
  const isFollowUp = interaction.followUp;

  async function handleNoteBlur() {
    if (noteDraft === (interaction.note ?? "")) return;
    await patch({ note: noteDraft || null }, "note");
  }

  return (
    <section className="my-8 border-y border-border bg-card/20 px-5 py-4">
      {/* Toggle row */}
      <div className="flex flex-wrap items-center gap-2">
        <ToggleButton
          active={isStarred}
          onClick={() => patch({ starred: !isStarred }, "star")}
          glyph="★"
          label="Star"
        />
        <ToggleButton
          active={isRead}
          onClick={() => patch({ read: !isRead }, "read")}
          glyph="✓"
          label="Mark read"
        />
        <ToggleButton
          active={isFollowUp}
          onClick={() => patch({ followUp: !isFollowUp }, "followUp")}
          glyph="◐"
          label="Follow up"
        />
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          {saving ? "saving…" : ""}
        </span>
      </div>

      {/* Notes textarea */}
      <div className="mt-4">
        <label
          htmlFor="interaction-note"
          className="mb-1.5 block font-mono text-[9.5px] font-medium uppercase tracking-[0.22em] text-muted-foreground"
        >
          Notes
        </label>
        <textarea
          id="interaction-note"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={handleNoteBlur}
          placeholder="Personal notes — save on blur"
          className="block min-h-[80px] w-full resize-y border border-border bg-background/40 px-3 py-2 font-display text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none"
        />
      </div>
    </section>
  );
}

function ToggleButton({
  active,
  onClick,
  glyph,
  label,
}: {
  active: boolean;
  onClick: () => void;
  glyph: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary shadow-[inset_2px_0_0_0_theme(colors.primary)] pl-[13px]"
          : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground",
      )}
    >
      <span className="text-[13px] leading-none">{glyph}</span>
      {label}
    </button>
  );
}
