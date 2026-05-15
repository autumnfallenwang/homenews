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
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.22em] text-sidebar-foreground/60">
          Actions
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-sidebar-foreground/40">
          {saving ? "saving…" : ""}
        </span>
      </div>

      <div className="flex flex-col gap-1">
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
      </div>

      <div className="mt-2">
        <label
          htmlFor="interaction-note"
          className="mb-1.5 block font-mono text-[9.5px] font-medium uppercase tracking-[0.22em] text-sidebar-foreground/60"
        >
          Notes
        </label>
        <textarea
          id="interaction-note"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={handleNoteBlur}
          placeholder="Personal notes — save on blur"
          className="block min-h-[140px] w-full resize-y rounded-sm border border-sidebar-border bg-transparent px-2 py-1.5 text-[12px] leading-relaxed text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus:border-sidebar-ring focus:outline-none"
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
        "inline-flex items-center gap-2 rounded-sm border px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
        active
          ? "border-sidebar-primary/60 bg-sidebar-primary/10 text-sidebar-primary"
          : "border-sidebar-border text-sidebar-foreground/70 hover:text-sidebar-foreground",
      )}
    >
      <span className="text-[12px] leading-none">{glyph}</span>
      <span className="flex-1">{label}</span>
    </button>
  );
}
