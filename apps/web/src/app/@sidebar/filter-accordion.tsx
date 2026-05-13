"use client";

// FilterAccordion — dashboard sidebar contextual content.
//
// Vertical, accordion-based reimagining of the Phase 13 horizontal
// FilterBar. URL is the source of truth (same searchParams pattern as
// filter-bar.tsx); the page's main fetch and this component's fetch
// both read from URL, so URL → query is automatic.
//
// Layout: search input at top, six collapsible SidebarGroup sections
// (Sources / Categories / Tags / Thresholds / Published / Sort), Reset
// link at the bottom. Each section default-opens iff it has an active
// value, so the user lands on a glanceable summary of "what's currently
// filtering my view".

import type { RankedFacets } from "@homenews/shared";
import { ChevronDown, RotateCcw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@/components/ui/sidebar";
import type { RankedFilters } from "@/lib/api";
import { cn } from "@/lib/utils";

// ───────────────────────── types ─────────────────────────

interface FilterAccordionProps {
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
  { id: "24h", label: "24h", days: 1 },
  { id: "7d", label: "7d", days: 7 },
  { id: "30d", label: "30d", days: 30 },
  { id: "all", label: "All", days: null },
];

// ──────────────────────── helpers ────────────────────────

function parseSort(raw: string | null): { field: SortField; direction: "asc" | "desc" } {
  const s = raw ?? "-composite";
  const desc = s.startsWith("-");
  const field = (desc ? s.slice(1) : s) as SortField;
  return { field, direction: desc ? "desc" : "asc" };
}

function isoDayStart(dateStr: string): string {
  return `${dateStr}T00:00:00.000Z`;
}

function isoToDay(iso: string): string {
  return iso.slice(0, 10);
}

// ───────────────────── main component ─────────────────────

export function FilterAccordion({
  initialFilters,
  availableSources,
  availableCategories,
  availableTags,
  facets,
}: FilterAccordionProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

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

  // Authoritative filter state lives in the URL.
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

  // Always-pathname navigate — wraps router.replace in startTransition for
  // in-page shimmer (no full reload, no scroll jump).
  const navigate = useCallback(
    (url: string) => {
      startTransition(() => {
        router.replace(url, { scroll: false });
      });
    },
    [router],
  );

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
      if (parsed.field !== field) {
        nextSort = `-${field}`;
      } else if (parsed.direction === "desc") {
        nextSort = field;
      } else {
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
    <>
      {/* Compact search input at the top of the contextual zone. */}
      <SidebarGroup>
        <SidebarGroupContent className="px-2">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search articles…"
            className="w-full rounded-sm border border-sidebar-border bg-transparent px-2 py-1.5 text-[12px] placeholder:text-sidebar-foreground/40 focus:border-sidebar-ring focus:outline-none"
          />
        </SidebarGroupContent>
      </SidebarGroup>

      <ChipSection
        label="Sources"
        items={availableSources}
        selected={filters.sources ?? []}
        counts={sourceCounts}
        onToggle={(v) => toggleChip("sources", v)}
      />

      <ChipSection
        label="Categories"
        items={availableCategories}
        selected={filters.categories ?? []}
        counts={categoryCounts}
        onToggle={(v) => toggleChip("categories", v)}
      />

      <ChipSection
        label="Tags"
        items={availableTags}
        selected={filters.tags ?? []}
        counts={tagCounts}
        onToggle={(v) => toggleChip("tags", v)}
      />

      <AccordionSection
        label="Thresholds"
        defaultOpen={Boolean(
          filters.composite_gte || filters.relevance_gte || filters.importance_gte,
        )}
        activeCount={
          [filters.composite_gte, filters.relevance_gte, filters.importance_gte].filter(Boolean)
            .length
        }
      >
        <div className="flex flex-col gap-3 px-2 pt-2 pb-1">
          <Slider
            label="Composite"
            value={filters.composite_gte ?? 0}
            onChange={(v) => setThreshold("composite_gte", v)}
          />
          <Slider
            label="Relevance"
            value={filters.relevance_gte ?? 0}
            onChange={(v) => setThreshold("relevance_gte", v)}
          />
          <Slider
            label="Importance"
            value={filters.importance_gte ?? 0}
            onChange={(v) => setThreshold("importance_gte", v)}
          />
        </div>
      </AccordionSection>

      <AccordionSection
        label="Published"
        defaultOpen={Boolean(filters.published_at_gte || filters.published_at_lte)}
        activeCount={filters.published_at_gte || filters.published_at_lte ? 1 : 0}
      >
        <div className="flex flex-col gap-2 px-2 pt-2 pb-1">
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.days)}
                className={cn(
                  "rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
                  activePreset === preset.id
                    ? "border-sidebar-primary bg-sidebar-primary/10 text-sidebar-primary"
                    : "border-sidebar-border text-sidebar-foreground/70 hover:text-sidebar-foreground",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <DateField
              label="From"
              value={filters.published_at_gte ? isoToDay(filters.published_at_gte) : ""}
              onChange={(v) => setDate("published_at_gte", v)}
            />
            <DateField
              label="To"
              value={filters.published_at_lte ? isoToDay(filters.published_at_lte) : ""}
              onChange={(v) => setDate("published_at_lte", v)}
            />
          </div>
        </div>
      </AccordionSection>

      <AccordionSection
        label="Sort"
        defaultOpen={Boolean(filters.sort && filters.sort !== "-composite")}
        activeCount={filters.sort && filters.sort !== "-composite" ? 1 : 0}
      >
        <div className="flex flex-col px-2 pt-2 pb-1">
          {SORT_FIELDS.map((field) => {
            const active = currentSort.field === field;
            let arrow = "";
            if (active) arrow = currentSort.direction === "desc" ? "↓" : "↑";
            return (
              <button
                key={field}
                type="button"
                onClick={() => setSort(field)}
                className={cn(
                  "flex items-center justify-between rounded-sm px-2 py-1.5 text-left text-[12px] transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50",
                )}
              >
                <span>{SORT_LABELS[field]}</span>
                <span className="font-mono text-[11px] text-sidebar-foreground/60">{arrow}</span>
              </button>
            );
          })}
        </div>
      </AccordionSection>

      <SidebarGroup>
        <SidebarGroupContent className="px-2">
          <button
            type="button"
            onClick={resetAll}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            Reset all
          </button>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}

// ───────────────────────── sub-components ─────────────────────────

function ChipSection({
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
    <AccordionSection label={label} defaultOpen={selected.length > 0} activeCount={selected.length}>
      <div className="flex flex-col px-2 pt-2 pb-1">
        {items.length === 0 ? (
          <span className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/40">
            none available
          </span>
        ) : (
          items.map((item) => {
            const active = selected.includes(item);
            const count = counts?.get(item);
            return (
              <button
                key={item}
                type="button"
                onClick={() => onToggle(item)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-[12px] transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50",
                )}
              >
                <span className="truncate">{item}</span>
                {count !== undefined && (
                  <span className="font-mono text-[10px] tabular-nums text-sidebar-foreground/50">
                    {count}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </AccordionSection>
  );
}

function AccordionSection({
  label,
  defaultOpen,
  activeCount,
  children,
}: {
  label: string;
  defaultOpen: boolean;
  activeCount: number;
  children: React.ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="group/section">
      <SidebarGroup className="py-0">
        <SidebarGroupLabel
          className="cursor-pointer"
          render={
            <CollapsibleTrigger className="flex w-full items-center justify-between hover:text-sidebar-foreground" />
          }
        >
          <span className="flex items-center gap-1.5">
            <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]/section:-rotate-90" />
            <span>{label}</span>
          </span>
          {activeCount > 0 && (
            <span className="font-mono text-[10px] tabular-nums text-sidebar-primary">
              {activeCount}
            </span>
          )}
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>{children}</SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
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
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/60">
        <span>{label}</span>
        <span
          className={cn(
            "font-mono text-[11px] font-semibold tabular-nums",
            isActive ? "text-sidebar-primary" : "text-sidebar-foreground/40",
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
    <label className="flex items-baseline gap-2 rounded-sm border border-sidebar-border px-2 py-1">
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-sidebar-foreground/60">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent font-mono text-[11px] text-sidebar-foreground focus:outline-none"
      />
    </label>
  );
}
