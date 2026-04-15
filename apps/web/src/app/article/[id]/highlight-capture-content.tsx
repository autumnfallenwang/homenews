"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createArticleHighlight } from "@/lib/api";
import { cn } from "@/lib/utils";

interface HighlightCaptureContentProps {
  articleId: string;
  html: string;
}

interface SelectionState {
  text: string;
  x: number;
  y: number;
}

// Wraps the reader-mode article body with a mouseup listener that captures
// text selections and shows a floating "Save highlight" button anchored to
// the selection. Click-away dismisses. Hitting the button POSTs to the API
// and flashes a brief "saved ✓" confirmation before clearing state.
//
// Task 83 scope: capture + save only. The sidebar list of saved highlights
// and any inline re-rendering live in Task 84.
export function HighlightCaptureContent({ articleId, html }: HighlightCaptureContentProps) {
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  function handleMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (text.length === 0) return;

    const container = contentRef.current;
    if (!container) return;
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;

    const rect = range.getBoundingClientRect();
    setSelection({
      text,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    });
    setJustSaved(false);
  }

  // Click-away listener: dismisses the floating button on any document
  // mousedown that isn't the button itself. Runs before the mouseup that
  // would start a new selection, which is fine — the mouseup handler
  // simply sets selection back to the new text.
  useEffect(() => {
    function handleClickAway(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-highlight-button]")) return;
      setSelection(null);
    }
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, []);

  async function save() {
    if (!selection) return;
    setSaving(true);
    try {
      await createArticleHighlight(articleId, { text: selection.text });
      setJustSaved(true);
      router.refresh();
      // Brief confirmation, then clear the UI + the native browser selection.
      setTimeout(() => {
        setSelection(null);
        setJustSaved(false);
        window.getSelection()?.removeAllRanges();
      }, 1200);
    } catch {
      // Silent failure for now — a toast system can land later.
    } finally {
      setSaving(false);
    }
  }

  let label = "Save highlight";
  if (saving) label = "Saving…";
  else if (justSaved) label = "Saved ✓";

  return (
    <>
      <article
        ref={contentRef}
        className="reader-content"
        onMouseUp={handleMouseUp}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: extracted HTML comes from our own server via Mozilla Readability; scripts stripped
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {selection && (
        <button
          type="button"
          data-highlight-button
          onClick={save}
          style={{
            position: "fixed",
            left: selection.x,
            top: selection.y,
            transform: "translate(-50%, -100%)",
          }}
          className={cn(
            "z-50 border border-primary bg-background/95 px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-primary shadow-sm transition-colors hover:bg-primary/10",
            justSaved && "border-primary/70 text-primary/80",
          )}
        >
          {label}
        </button>
      )}
    </>
  );
}
