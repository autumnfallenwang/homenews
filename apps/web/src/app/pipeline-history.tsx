"use client";

import type { PipelineRun, PipelineRunStatus, PipelineTrigger } from "@homenews/shared";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleSlash,
  Clock,
  Keyboard,
  Loader2,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { fetchPipelineRuns } from "@/lib/api";
import { cn } from "@/lib/utils";

type Filter = "all" | "manual" | "scheduler";

interface PipelineHistoryProps {
  /** Bumped by the parent when a run finishes, so the drawer re-fetches
   *  immediately instead of waiting for the 60s poll. */
  refreshKey: number;
}

export function PipelineHistory({ refreshKey }: PipelineHistoryProps) {
  const [runs, setRuns] = useState<PipelineRun[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Fetch on filter change + parent signals (mount, run completion).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `refreshKey` is a bump-counter signal from the parent — the value itself is unused, but a change triggers a refetch
  useEffect(() => {
    let cancelled = false;
    fetchPipelineRuns({
      limit: 20,
      trigger: filter === "all" ? undefined : filter,
    })
      .then((rs) => {
        if (cancelled) return;
        setRuns(rs);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [filter, refreshKey]);

  // Poll on window focus + 60s interval while the tab is visible
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const refresh = () => {
      fetchPipelineRuns({
        limit: 20,
        trigger: filter === "all" ? undefined : filter,
      })
        .then(setRuns)
        .catch(() => {
          /* non-critical — background refresh is best-effort */
        });
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
        if (!interval) interval = setInterval(refresh, 60_000);
      } else if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);
    if (document.visibilityState === "visible") {
      interval = setInterval(refresh, 60_000);
    }

    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (interval) clearInterval(interval);
    };
  }, [filter]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="border-t border-border/70 bg-card/40 px-7 py-5">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Recent pipeline runs
          {runs !== null && (
            <>
              {" · "}
              <span className="text-foreground">showing {runs.length}</span>
            </>
          )}
        </span>
        <div className="ml-auto">
          <SegmentedFilter value={filter} onChange={setFilter} />
        </div>
      </div>

      {/* Body */}
      {error && (
        <div className="flex items-center gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-destructive">
          <AlertTriangle className="h-3 w-3" />
          {error}
        </div>
      )}

      {!error && runs === null && (
        <p className="py-6 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Loading history…
        </p>
      )}

      {!error && runs !== null && runs.length === 0 && (
        <p className="py-6 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {filter === "all"
            ? "No runs yet. Click Run pipeline to start one."
            : `No ${filter} runs yet.`}
        </p>
      )}

      {!error && runs !== null && runs.length > 0 && (
        <div className="flex flex-col">
          {runs.map((run) => (
            <RunRow
              key={run.id}
              run={run}
              expanded={expandedIds.has(run.id)}
              onToggle={() => toggleExpand(run.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Row ---

function RunRow({
  run,
  expanded,
  onToggle,
}: {
  run: PipelineRun;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-t border-border/40 first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full grid-cols-[100px_22px_170px_80px_1fr_14px] items-center gap-4 py-3 pr-1 text-left transition-colors hover:bg-muted/30"
      >
        <TriggerChip trigger={run.trigger} />
        <StatusGlyph status={run.status} />
        <TimeCell startedAt={run.startedAt} />
        <DurationCell ms={run.durationMs} />
        <CountsCell run={run} />
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 transition-transform",
            expanded ? "rotate-90 text-primary" : "text-muted-foreground/60",
          )}
        />
      </button>
      {expanded && <DetailPanel run={run} />}
    </div>
  );
}

function TriggerChip({ trigger }: { trigger: PipelineTrigger }) {
  const Icon = trigger === "scheduler" ? Clock : Keyboard;
  const label = trigger === "scheduler" ? "Cron" : "Manual";
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function StatusGlyph({ status }: { status: PipelineRunStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-primary" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    case "cancelled":
      return <CircleSlash className="h-4 w-4 text-muted-foreground" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-destructive" />;
  }
}

function TimeCell({ startedAt }: { startedAt: string }) {
  const rel = relativeTime(startedAt);
  const abs = formatAbsoluteTime(startedAt);
  return (
    <span className="font-mono text-[10px] tracking-[0.12em]">
      <span className="text-foreground uppercase">{rel}</span>
      <span className="ml-2 text-muted-foreground/80">{abs}</span>
    </span>
  );
}

function DurationCell({ ms }: { ms: number | null }) {
  return (
    <span className="tabular font-mono text-[10px] font-medium text-foreground/80">
      {formatDuration(ms)}
    </span>
  );
}

function CountsCell({ run }: { run: PipelineRun }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2 overflow-hidden font-mono text-[10px] text-muted-foreground">
      <CountSegment label="fetched" value={run.fetchAdded} />
      <span className="text-muted-foreground/40">·</span>
      <CountSegment label="analyzed" value={run.analyzeAnalyzed} />
      <span className="text-muted-foreground/40">·</span>
      <CountSegment label="summarized" value={run.summarizeSummarized} />
    </span>
  );
}

function CountSegment({ label, value }: { label: string; value: number | null }) {
  if (value === null) {
    return <span className="text-muted-foreground/50">{label} —</span>;
  }
  return (
    <span>
      {label} <span className="font-medium text-foreground">{value}</span>
    </span>
  );
}

// --- Detail panel ---

function DetailPanel({ run }: { run: PipelineRun }) {
  return (
    <div
      className={cn(
        "mb-2 ml-4 border-l-2 border-t border-dashed border-border/50 bg-background/30 px-4 py-3 font-mono text-[10px]",
        run.status === "failed" && "border-l-destructive",
        run.status === "cancelled" && "border-l-muted-foreground/60",
        run.status === "completed" && "border-l-primary/50",
        run.status === "running" && "border-l-primary",
      )}
    >
      <DetailRow label="Run id" value={run.id} />
      <DetailRow label="Started" value={formatFullTimestamp(run.startedAt)} />
      {run.endedAt && <DetailRow label="Ended" value={formatFullTimestamp(run.endedAt)} />}
      <DetailRow label="Duration" value={formatDuration(run.durationMs)} />
      <DetailRow label="Phases" value={phaseSummary(run)} />
      {run.errorMessage && (
        <DetailRow
          label={run.status === "failed" ? "Failed at" : "Reason"}
          value={run.errorMessage}
          emphasized={run.status === "failed"}
        />
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="flex gap-3 py-0.5">
      <span className="w-[90px] shrink-0 text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 break-words",
          emphasized ? "text-destructive" : "text-foreground/80",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function phaseSummary(run: PipelineRun): string {
  const parts: string[] = [];
  if (run.fetchAdded === null) {
    parts.push("Fetch —");
  } else {
    parts.push(`Fetch ✓ ${run.fetchAdded}`);
  }
  if (run.analyzeAnalyzed === null) {
    parts.push("Analyze —");
  } else {
    parts.push(
      `Analyze ${run.analyzeAnalyzed}${run.analyzeErrors ? ` (${run.analyzeErrors} err)` : ""}`,
    );
  }
  if (run.summarizeSummarized === null) {
    parts.push("Summarize —");
  } else {
    parts.push(
      `Summarize ${run.summarizeSummarized}${run.summarizeErrors ? ` (${run.summarizeErrors} err)` : ""}`,
    );
  }
  return parts.join(" · ");
}

// --- Segmented filter ---

function SegmentedFilter({
  value,
  onChange,
}: {
  value: Filter;
  onChange: (value: Filter) => void;
}) {
  const options: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "All" },
    { id: "manual", label: "Manual" },
    { id: "scheduler", label: "Scheduled" },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-sm border border-border/70">
      {options.map((opt, i) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              "px-3 py-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.2em] transition-colors",
              i > 0 && "border-l border-border/70",
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// --- Helpers (duplicated from pipeline-control.tsx; extract to lib/time.ts
//     once a third consumer shows up) ---

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatAbsoluteTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatFullTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}m ${String(ss).padStart(2, "0")}s`;
}
