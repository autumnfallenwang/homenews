"use client";

import type { SearchMode, SearchTarget } from "@homenews/shared";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface SearchControlsProps {
  initialQ: string;
  initialMode: SearchMode;
  initialTarget: SearchTarget;
}

const MODE_OPTIONS: { value: SearchMode; label: string }[] = [
  { value: "hybrid", label: "Hybrid" },
  { value: "keyword", label: "Keyword" },
  { value: "fuzzy", label: "Fuzzy" },
  { value: "semantic", label: "Semantic" },
];

const TARGET_OPTIONS: { value: SearchTarget; label: string }[] = [
  { value: "all", label: "All" },
  { value: "articles", label: "Articles" },
  { value: "highlights", label: "Highlights" },
];

export function SearchControls({ initialQ, initialMode, initialTarget }: SearchControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Local draft for the text input — only committed to URL on explicit
  // form submit (Enter or button click). Browsers are happy with this
  // pattern and it avoids the debounce loop used on the dashboard.
  const [draft, setDraft] = useState(initialQ);

  // Keep local draft in sync with the URL when the user hits back/forward
  // so the input box reflects the current query.
  useEffect(() => {
    const urlQ = searchParams.get("q") ?? "";
    setDraft((prev) => (prev === urlQ ? prev : urlQ));
  }, [searchParams]);

  function updateUrl(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateUrl({ q: draft.trim() || undefined });
  }

  function setMode(mode: SearchMode) {
    // Default mode is hybrid — clear param when selected.
    updateUrl({ mode: mode === "hybrid" ? undefined : mode });
  }

  function setTarget(target: SearchTarget) {
    updateUrl({ target: target === "all" ? undefined : target });
  }

  return (
    <section className="mb-8">
      {/* Search input row */}
      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex items-center gap-3 border-b border-border/80 pb-2">
          <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.18em] text-primary">
            Q
          </span>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search articles, highlights, your knowledge base…"
            className="flex-1 bg-transparent font-display text-[18px] italic placeholder:italic placeholder:text-muted-foreground/70 focus:outline-none"
          />
          {draft && (
            <button
              type="button"
              onClick={() => {
                setDraft("");
                updateUrl({ q: undefined });
              }}
              className="border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground hover:border-destructive hover:text-destructive"
            >
              × Clear
            </button>
          )}
        </div>
      </form>

      {/* Mode + target segment row */}
      <div className="flex flex-wrap items-center gap-4">
        <Segment
          label="Mode"
          options={MODE_OPTIONS}
          value={initialMode}
          onChange={(v) => setMode(v as SearchMode)}
        />
        <Segment
          label="Target"
          options={TARGET_OPTIONS}
          value={initialTarget}
          onChange={(v) => setTarget(v as SearchTarget)}
        />
      </div>
    </section>
  );
}

interface SegmentProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

function Segment<T extends string>({ label, options, value, onChange }: SegmentProps<T>) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap border border-border">
        {options.map((opt, i) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "px-3 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] transition-colors",
                i > 0 && "border-l border-border",
                active
                  ? "bg-primary/10 text-primary shadow-[inset_0_-1px_0_0_theme(colors.primary)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
