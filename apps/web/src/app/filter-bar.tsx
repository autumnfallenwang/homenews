"use client";

import type { RankedFacets } from "@homenews/shared";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RankedFilters } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useNavigation } from "./dashboard-shell";

// ───────────────────────── types ─────────────────────────

interface FilterBarProps {
  initialFilters: RankedFilters;
  availableSources: string[];
  availableCategories: string[];
  availableTags: string[];
  facets: RankedFacets | null;
}

type CountMap = Map<string, number> | null;

type SortField = "composite" | "relevance" | "importance" | "freshness" | "published" | "analyzed";

const SORT_LABELS: Record<SortField, string> = {
  composite: "Composite",
  relevance: "Relevance",
  importance: "Importance",
  freshness: "Freshness",
  published: "Published",
  analyzed: "Analyzed",
};

const SORT_FIELDS: SortField[] = [
  "composite",
  "relevance",
  "importance",
  "freshness",
  "published",
  "analyzed",
];

const PRESETS: { id: string; label: string; days: number | null }[] = [
  { id: "24h", label: "Last 24h", days: 1 },
  { id: "7d", label: "Last 7d", days: 7 },
  { id: "30d", label: "Last 30d", days: 30 },
  { id: "all", label: "All time", days: null },
];

// ──────────────────────── helpers ────────────────────────

function parseSort(raw: string | null): { field: SortField; direction: "asc" | "desc" } {
  const s = raw ?? "-composite";
  const desc = s.startsWith("-");
  const field = (desc ? s.slice(1) : s) as SortField;
  return { field, direction: desc ? "desc" : "asc" };
}

function isoDayStart(dateStr: string): string {
  // native <input type="date"> gives YYYY-MM-DD; the backend wants full ISO
  // 8601 with offset. Anchor at midnight UTC.
  return `${dateStr}T00:00:00.000Z`;
}

function isoToDay(iso: string): string {
  // strip full ISO back to YYYY-MM-DD for the native input display
  return iso.slice(0, 10);
}

function countActive(f: RankedFilters): number {
  let n = 0;
  if (f.q) n++;
  if (f.sources?.length) n++;
  if (f.categories?.length) n++;
  if (f.tags?.length) n++;
  if (f.composite_gte) n++;
  if (f.relevance_gte) n++;
  if (f.importance_gte) n++;
  if (f.published_at_gte || f.published_at_lte) n++;
  if (f.sort && f.sort !== "-composite") n++;
  return n;
}

// ───────────────────── component ─────────────────────────

export function FilterBar({
  initialFilters,
  availableSources,
  availableCategories,
  availableTags,
  facets,
}: FilterBarProps) {
  const { navigate, isPending } = useNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sourceCounts: CountMap = useMemo(
    () => (facets ? new Map(facets.sources.map((f) => [f.name, f.count])) : null),
    [facets],
  );
  const categoryCounts: CountMap = useMemo(
    () => (facets ? new Map(facets.categories.map((f) => [f.name, f.count])) : null),
    [facets],
  );
  const tagCounts: CountMap = useMemo(
    () => (facets ? new Map(facets.tags.map((f) => [f.name, f.count])) : null),
    [facets],
  );

  // The authoritative filter state comes from the URL on every render,
  // except for the debounced search input which has its own local mirror.
  const filters: RankedFilters = useMemo(() => {
    const csv = (k: string) => searchParams.get(k)?.split(",").filter(Boolean) ?? undefined;
    const num = (k: string) => {
      const v = searchParams.get(k);
      return v ? Number(v) : undefined;
    };
    return {
      q: searchParams.get("q") ?? undefined,
      sources: csv("sources"),
      categories: csv("categories"),
      tags: csv("tags"),
      composite_gte: num("composite_gte"),
      relevance_gte: num("relevance_gte"),
      importance_gte: num("importance_gte"),
      published_at_gte: searchParams.get("published_at_gte") ?? undefined,
      published_at_lte: searchParams.get("published_at_lte") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
    };
  }, [searchParams]);

  const [searchInput, setSearchInput] = useState(initialFilters.q ?? "");

  // One outer "More filters" toggle reveals the Categories / Tags / Thresholds
  // / Published block as a single unit. Auto-opens on mount if any of the four
  // has an active value.
  const [moreOpen, setMoreOpen] = useState(() => {
    return Boolean(
      initialFilters.categories?.length ||
        initialFilters.tags?.length ||
        initialFilters.composite_gte ||
        initialFilters.relevance_gte ||
        initialFilters.importance_gte ||
        initialFilters.published_at_gte ||
        initialFilters.published_at_lte,
    );
  });

  // URL writer — takes a patch map. Undefined / empty string clears the key.
  // Any filter change resets pagination to page 1; only the Pager component
  // ever sets offset, so we can drop it unconditionally here.
  const updateUrl = useCallback(
    (patch: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "") params.delete(k);
        else params.set(k, v);
      }
      params.delete("offset");
      const qs = params.toString();
      navigate(qs ? `${pathname}?${qs}` : pathname);
    },
    [navigate, pathname, searchParams],
  );

  // Debounced search input → ?q=
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (searchInput === current) return;
    const t = setTimeout(() => {
      updateUrl({ q: searchInput || undefined });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, searchParams, updateUrl]);

  // URL → searchInput sync (back/forward navigation)
  useEffect(() => {
    const urlQ = searchParams.get("q") ?? "";
    setSearchInput((prev) => (prev === urlQ ? prev : urlQ));
  }, [searchParams]);

  // ──────────── filter mutators ────────────

  const toggleChip = useCallback(
    (dim: "sources" | "categories" | "tags", value: string) => {
      const current = filters[dim] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      updateUrl({ [dim]: next.length > 0 ? next.join(",") : undefined });
    },
    [filters, updateUrl],
  );

  const setThreshold = useCallback(
    (key: "composite_gte" | "relevance_gte" | "importance_gte", val: number) => {
      updateUrl({ [key]: val > 0 ? String(val) : undefined });
    },
    [updateUrl],
  );

  const setDate = useCallback(
    (which: "published_at_gte" | "published_at_lte", day: string) => {
      updateUrl({ [which]: day ? isoDayStart(day) : undefined });
    },
    [updateUrl],
  );

  const applyPreset = useCallback(
    (days: number | null) => {
      if (days === null) {
        updateUrl({ published_at_gte: undefined, published_at_lte: undefined });
        return;
      }
      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      updateUrl({ published_at_gte: from, published_at_lte: undefined });
    },
    [updateUrl],
  );

  const setSort = useCallback(
    (field: SortField) => {
      const parsed = parseSort(filters.sort ?? null);
      let nextSort: string;
      if (parsed.field === field) {
        // flip direction on same field
        nextSort = parsed.direction === "desc" ? field : `-${field}`;
      } else {
        // new field, desc by default
        nextSort = `-${field}`;
      }
      updateUrl({ sort: nextSort === "-composite" ? undefined : nextSort });
    },
    [filters.sort, updateUrl],
  );

  const resetAll = useCallback(() => {
    setSearchInput("");
    navigate(pathname);
  }, [navigate, pathname]);

  // ──────────── derived ────────────

  const active = countActive(filters);
  const advancedActive = useMemo(() => {
    let n = 0;
    if (filters.categories?.length) n++;
    if (filters.tags?.length) n++;
    if (filters.composite_gte || filters.relevance_gte || filters.importance_gte) n++;
    if (filters.published_at_gte || filters.published_at_lte) n++;
    return n;
  }, [filters]);
  const currentSort = parseSort(filters.sort ?? null);
  const activePreset = useMemo(() => {
    if (!filters.published_at_gte || filters.published_at_lte) return null;
    const fromMs = new Date(filters.published_at_gte).getTime();
    const elapsedDays = Math.round((Date.now() - fromMs) / (24 * 60 * 60 * 1000));
    const match = PRESETS.find((p) => p.days === elapsedDays);
    return match?.id ?? null;
  }, [filters.published_at_gte, filters.published_at_lte]);

  // ──────────── render ────────────

  return (
    <section
      className={cn(
        "relative mb-6 border-y border-border bg-card/40",
        isPending && "filterbar-edge-pulse",
      )}
    >
      {/* header strip */}
      <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Filters{" "}
          {active > 0 ? (
            <>
              · <span className="text-primary">{active} ACTIVE</span>
            </>
          ) : (
            <>· NONE</>
          )}
        </span>
        <button
          type="button"
          onClick={resetAll}
          className={cn(
            "font-mono text-[9px] uppercase tracking-[0.2em] transition-colors",
            active > 0
              ? "text-destructive hover:text-destructive/80"
              : "text-muted-foreground/50 cursor-default",
          )}
          disabled={active === 0}
        >
          × Reset all
        </button>
      </div>

      {/* search row — always open */}
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-4 border-b border-border/80 pb-2">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Q
          </span>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search headlines, summaries, analysis…"
            className="flex-1 bg-transparent font-display text-[16px] italic placeholder:italic placeholder:text-muted-foreground/70 focus:outline-none"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="border border-border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground hover:border-destructive hover:text-destructive"
            >
              × Clear
            </button>
          )}
        </div>
      </div>

      {/* sources row — always open */}
      <ChipRow
        label="Sources"
        items={availableSources}
        selected={filters.sources ?? []}
        counts={sourceCounts}
        onToggle={(v) => toggleChip("sources", v)}
      />

      {/* single outer toggle for all advanced filters */}
      <div className="border-b border-border">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-card/30"
        >
          <span
            className={cn(
              "inline-block text-[10px] text-muted-foreground transition-transform",
              moreOpen && "rotate-90",
            )}
          >
            ▸
          </span>
          <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            More filters
          </span>
          {!moreOpen && advancedActive > 0 && (
            <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-primary">
              · {advancedActive} active
            </span>
          )}
        </button>

        {moreOpen && (
          <div className="border-t border-border/60">
            <ChipRow
              label="Category"
              items={availableCategories}
              selected={filters.categories ?? []}
              counts={categoryCounts}
              onToggle={(v) => toggleChip("categories", v)}
            />
            <ChipRow
              label="Tags"
              items={availableTags}
              selected={filters.tags ?? []}
              counts={tagCounts}
              onToggle={(v) => toggleChip("tags", v)}
            />
            <div className="flex items-start gap-4 border-b border-border px-5 py-3">
              <span className="mt-1 w-20 shrink-0 font-mono text-[9.5px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Thresholds
              </span>
              <div className="flex flex-1 flex-col gap-4 py-1 md:flex-row md:gap-8">
                <Slider
                  label="Composite ≥"
                  value={filters.composite_gte ?? 0}
                  onChange={(v) => setThreshold("composite_gte", v)}
                />
                <Slider
                  label="Relevance ≥"
                  value={filters.relevance_gte ?? 0}
                  onChange={(v) => setThreshold("relevance_gte", v)}
                />
                <Slider
                  label="Importance ≥"
                  value={filters.importance_gte ?? 0}
                  onChange={(v) => setThreshold("importance_gte", v)}
                />
              </div>
            </div>
            <div className="flex items-start gap-4 px-5 py-3">
              <span className="mt-1 w-20 shrink-0 font-mono text-[9.5px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Published
              </span>
              <div className="flex flex-1 flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <DateField
                    label="From"
                    value={filters.published_at_gte ? isoToDay(filters.published_at_gte) : ""}
                    onChange={(v) => setDate("published_at_gte", v)}
                  />
                  <span className="font-mono text-[11px] text-muted-foreground">→</span>
                  <DateField
                    label="To"
                    value={filters.published_at_lte ? isoToDay(filters.published_at_lte) : ""}
                    onChange={(v) => setDate("published_at_lte", v)}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.days)}
                      className={cn(
                        "border px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] transition-colors",
                        activePreset === p.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* sort row — always open */}
      <div className="flex items-center gap-4 px-5 py-3">
        <span className="w-20 shrink-0 font-mono text-[9.5px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          Sort by
        </span>
        <div className="flex flex-wrap border border-border">
          {SORT_FIELDS.map((f, i) => {
            const isActive = currentSort.field === f;
            let arrow = "";
            if (isActive) arrow = currentSort.direction === "desc" ? "↓" : "↑";
            return (
              <button
                key={f}
                type="button"
                onClick={() => setSort(f)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] transition-colors",
                  i > 0 && "border-l border-border",
                  isActive
                    ? "bg-primary/10 text-primary shadow-[inset_0_-1px_0_0_theme(colors.primary)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {SORT_LABELS[f]}
                <span className="text-[10px]">{arrow}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─────────────────── sub-components ──────────────────────

function ChipRow({
  label,
  items,
  selected,
  counts,
  onToggle,
}: {
  label: string;
  items: string[];
  selected: string[];
  counts: CountMap;
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex items-start gap-4 border-b border-border px-5 py-3">
      <span className="mt-1 w-20 shrink-0 font-mono text-[9.5px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </span>
      <ChipListInline items={items} selected={selected} counts={counts} onToggle={onToggle} />
    </div>
  );
}

function ChipListInline({
  items,
  selected,
  counts,
  onToggle,
}: {
  items: string[];
  selected: string[];
  counts: CountMap;
  onToggle: (v: string) => void;
}) {
  if (items.length === 0) {
    return (
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
        none available
      </span>
    );
  }
  return (
    <div className="flex flex-1 flex-wrap gap-1.5">
      {items.map((item) => {
        const active = selected.includes(item);
        const count = counts?.get(item);
        return (
          <button
            key={item}
            type="button"
            onClick={() => onToggle(item)}
            className={cn(
              "inline-flex items-baseline gap-2 border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
              active
                ? "border-primary bg-primary/10 text-primary shadow-[inset_2px_0_0_0_theme(colors.primary)] pl-[11px]"
                : "border-border text-foreground/80 hover:border-border/80 hover:text-foreground",
            )}
          >
            {item}
            {count !== undefined && (
              <span
                className={cn(
                  "text-[9.5px] font-normal tabular-nums",
                  active ? "text-primary/80" : "text-muted-foreground/60",
                )}
              >
                ({count})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const isActive = value > 0;
  return (
    <div className="flex flex-1 flex-col gap-2 min-w-0">
      <div className="flex items-baseline justify-between font-mono text-[9.5px] uppercase tracking-[0.2em] text-muted-foreground">
        <span>{label}</span>
        <span
          className={cn(
            "font-mono text-[12px] font-semibold tabular-nums",
            isActive ? "text-primary" : "text-muted-foreground/60",
          )}
        >
          {value}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="filterbar-range"
      />
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label
      className={cn(
        "inline-flex items-baseline gap-2 border px-3 py-1.5 font-mono text-[11px]",
        value ? "border-primary text-primary" : "border-border text-foreground",
      )}
    >
      <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent font-mono text-[11px] focus:outline-none"
      />
    </label>
  );
}
