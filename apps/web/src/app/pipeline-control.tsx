"use client";

import type {
  PipelineProgressEvent,
  PipelineRun,
  PipelineStatus,
  PipelineTrigger,
} from "@homenews/shared";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Keyboard,
  Loader2,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cancelPipelineRun, fetchPipelineStatus, PIPELINE_STREAM_URL } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PipelineHistory } from "./pipeline-history";

// --- Types ---

type Phase = "fetch" | "analyze" | "summarize";
type PhaseState = "upcoming" | "active" | "done";

interface RunProgress {
  /** Populated by the first `run-start` event. Null during the brief
   *  window between click and stream handshake. */
  runId: string | null;
  startedAt: number; // ms epoch — for the elapsed clock
  phase: Phase | "done";
  analyzeTotal: number;
  analyzeIndex: number;
  summarizeTotal: number;
  summarizeIndex: number;
  totals: {
    fetchAdded: number;
    fetchErrors: number;
    analyzeAnalyzed: number;
    analyzeErrors: number;
    summarizeSummarized: number;
    summarizeErrors: number;
  };
  tickerTitle: string;
  tickerFeed: string;
  tickerPhase: "analyze" | "summarize" | null;
}

function emptyProgress(): RunProgress {
  return {
    runId: null,
    startedAt: Date.now(),
    phase: "fetch",
    analyzeTotal: 0,
    analyzeIndex: 0,
    summarizeTotal: 0,
    summarizeIndex: 0,
    totals: {
      fetchAdded: 0,
      fetchErrors: 0,
      analyzeAnalyzed: 0,
      analyzeErrors: 0,
      summarizeSummarized: 0,
      summarizeErrors: 0,
    },
    tickerTitle: "",
    tickerFeed: "",
    tickerPhase: null,
  };
}

// --- Event reducer ---

function reduceProgress(prev: RunProgress, event: PipelineProgressEvent): RunProgress {
  switch (event.type) {
    case "run-start":
      return { ...prev, runId: event.runId };
    case "fetch-start":
      return { ...prev, phase: "fetch" };
    case "fetch-done":
      return {
        ...prev,
        totals: { ...prev.totals, fetchAdded: event.added, fetchErrors: event.errors },
      };
    case "analyze-start":
      return {
        ...prev,
        phase: "analyze",
        analyzeTotal: event.total ?? 0,
        analyzeIndex: 0,
      };
    case "analyze-item":
      return {
        ...prev,
        phase: "analyze",
        analyzeTotal: event.total,
        analyzeIndex: event.index + 1,
        tickerTitle: event.title,
        tickerFeed: event.feedName,
        tickerPhase: "analyze",
      };
    case "analyze-done":
      return {
        ...prev,
        totals: {
          ...prev.totals,
          analyzeAnalyzed: event.analyzed,
          analyzeErrors: event.errors,
        },
      };
    case "summarize-start":
      return {
        ...prev,
        phase: "summarize",
        summarizeTotal: event.total ?? 0,
        summarizeIndex: 0,
      };
    case "summarize-item":
      return {
        ...prev,
        phase: "summarize",
        summarizeTotal: event.total,
        summarizeIndex: event.index + 1,
        tickerTitle: event.title,
        tickerFeed: event.feedName,
        tickerPhase: "summarize",
      };
    case "summarize-done":
      return {
        ...prev,
        totals: {
          ...prev.totals,
          summarizeSummarized: event.summarized,
          summarizeErrors: event.errors,
        },
      };
    case "run-done":
      return { ...prev, phase: "done" };
    default:
      return prev;
  }
}

// --- Helpers ---

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

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

function phaseStateOf(phase: Phase, run: RunProgress): PhaseState {
  const order: Phase[] = ["fetch", "analyze", "summarize"];
  const currentIdx = run.phase === "done" ? order.length : order.indexOf(run.phase as Phase);
  const thisIdx = order.indexOf(phase);
  if (thisIdx < currentIdx) return "done";
  if (thisIdx === currentIdx) return "active";
  return "upcoming";
}

// --- Component ---

export function PipelineControl() {
  const router = useRouter();
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [run, setRun] = useState<RunProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  // Initial status fetch
  useEffect(() => {
    fetchPipelineStatus()
      .then(setStatus)
      .catch(() => setStatus({ activeRun: null, lastRun: null, nextRunAt: null }));
  }, []);

  // Re-poll on window focus
  useEffect(() => {
    const onFocus = () => {
      fetchPipelineStatus()
        .then(setStatus)
        .catch(() => {
          /* non-critical — status refresh is best-effort */
        });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Elapsed clock — runs while we own a run OR while we're watching an
  // externally-owned active run (from another tab / navigation return).
  useEffect(() => {
    const needsClock = run !== null || status?.activeRun != null;
    if (!needsClock) return;
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [run, status?.activeRun]);

  // Watching-mode status polling: re-fetch /status every 5s while we're
  // watching an externally-owned run, so we transition back to idle
  // promptly when the run ends (cancelled, completed, or failed).
  useEffect(() => {
    if (run !== null) return;
    if (status?.activeRun == null) return;
    const interval = setInterval(() => {
      fetchPipelineStatus()
        .then(setStatus)
        .catch(() => {
          /* best-effort */
        });
    }, 5000);
    return () => clearInterval(interval);
  }, [run, status?.activeRun]);

  // Reset the cancelling flag once the active run actually disappears
  // (either because we cancelled it or because it finished naturally).
  useEffect(() => {
    if (status?.activeRun == null && cancelling && run === null) {
      setCancelling(false);
    }
  }, [status?.activeRun, cancelling, run]);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  function startRun() {
    if (run) return;
    setError(null);
    setRun(emptyProgress());

    const es = new EventSource(PIPELINE_STREAM_URL);
    esRef.current = es;

    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as PipelineProgressEvent;
        setRun((prev) => (prev ? reduceProgress(prev, event) : prev));
        if (event.type === "run-done") {
          es.close();
          esRef.current = null;
          fetchPipelineStatus()
            .then(setStatus)
            .catch(() => {
              /* non-critical — status refresh after run-done is best-effort */
            });
          setHistoryRefreshKey((k) => k + 1);
          // Brief pause so the user sees the final totals, then transition
          // back to idle + refresh the dashboard's article list.
          setTimeout(() => {
            setRun(null);
            setCancelling(false);
            router.refresh();
          }, 700);
        }
      } catch {
        // malformed SSE payload — ignore
      }
    };

    es.addEventListener("error", () => {
      setError("Stream disconnected");
      es.close();
      esRef.current = null;
      setRun(null);
      setCancelling(false);
    });
  }

  async function cancelRun() {
    if (!run?.runId || cancelling) return;
    setCancelling(true);
    try {
      await cancelPipelineRun(run.runId);
      // The stream will emit run-done with status=cancelled; the component
      // transitions to idle via that event. `cancelling` stays true as
      // visual feedback until then.
    } catch (err) {
      console.error("Cancel failed:", err);
      setCancelling(false);
    }
  }

  // Cancel from the "watching" sub-state — we don't own an EventSource,
  // so we POST cancel via the runId from status.activeRun and wait for
  // the next /status poll to transition us back to idle.
  async function cancelWatchingRun() {
    const activeId = status?.activeRun?.id;
    if (!activeId || cancelling) return;
    setCancelling(true);
    try {
      await cancelPipelineRun(activeId);
    } catch (err) {
      console.error("Cancel failed:", err);
      setCancelling(false);
    }
  }

  const isRunning = run !== null;
  const isWatching = !isRunning && status?.activeRun != null;

  const showRunningChrome = isRunning || isWatching;

  return (
    <section
      aria-label="Pipeline control"
      className={cn(
        "relative border-y border-border",
        showRunningChrome ? "pipeline-running-wash" : "bg-card/40",
      )}
      data-state={showRunningChrome ? "running" : "idle"}
    >
      {/* Amber rail when running OR watching an external run */}
      {showRunningChrome && (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-primary"
          aria-hidden
        />
      )}

      <div className="mx-auto max-w-6xl px-7 py-4">
        {error && (
          <div className="mb-3 flex items-center gap-2 border border-destructive/40 bg-destructive/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-destructive">
            <AlertTriangle className="h-3 w-3" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="rounded-sm p-0.5 text-destructive/70 hover:text-destructive"
              aria-label="Dismiss error"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {isRunning ? (
          <RunningView
            run={run}
            elapsedMs={nowTick - run.startedAt}
            cancelling={cancelling}
            onCancel={cancelRun}
          />
        ) : (
          <IdleView
            status={status}
            nowTick={nowTick}
            cancelling={cancelling}
            onRun={startRun}
            onCancelWatching={cancelWatchingRun}
          />
        )}
      </div>

      {/* Disclosure row — toggles the history drawer */}
      <button
        type="button"
        onClick={() => setHistoryOpen((v) => !v)}
        className="flex w-full items-center gap-3 border-t border-border/60 px-7 py-2.5 text-left transition-colors hover:bg-muted/30"
        aria-expanded={historyOpen}
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 transition-transform",
            historyOpen ? "rotate-90 text-primary" : "text-muted-foreground/70",
          )}
        />
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {historyOpen ? "Hide history" : "Show history"}
        </span>
      </button>

      {historyOpen && <PipelineHistory refreshKey={historyRefreshKey} />}
    </section>
  );
}

// --- Idle view (also renders the "watching external run" sub-state) ---

function IdleView({
  status,
  nowTick,
  cancelling,
  onRun,
  onCancelWatching,
}: {
  status: PipelineStatus | null;
  nowTick: number;
  cancelling: boolean;
  onRun: () => void;
  onCancelWatching: () => void;
}) {
  const activeRun = status?.activeRun ?? null;
  const last = status?.lastRun ?? null;

  // ── Watching sub-state: an external run is active but we don't own
  //    its EventSource. Show elapsed + trigger + cancel, no phase/ticker.
  if (activeRun) {
    const elapsedMs = Math.max(0, nowTick - new Date(activeRun.startedAt).getTime());
    const elapsed = formatElapsed(elapsedMs);
    const [mm, ss] = elapsed.split(":");
    return (
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <StateBadge kind="running" />

        <div className="flex items-baseline gap-3 border-l border-border/60 pl-5">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Elapsed
          </span>
          <span className="tabular font-mono text-[22px] font-medium leading-none text-foreground">
            {mm}
            <span className="pipeline-colon-blink text-primary">:</span>
            {ss}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <TriggerChip trigger={activeRun.trigger} />
          <span className="text-muted-foreground/50">·</span>
          <span className="truncate">Live progress only in the tab that started this run</span>
        </div>

        <CancelButton cancelling={cancelling} onClick={onCancelWatching} />
      </div>
    );
  }

  // ── Normal idle state ──
  let middle: React.ReactNode;
  if (last) {
    middle = <LastRunSummary last={last} />;
  } else {
    middle = (
      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        No runs yet this session
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <StateBadge kind="idle" />

      <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 min-w-0">{middle}</div>

      <div className="flex items-center gap-3">
        {status?.nextRunAt && <NextPill nextRunAt={status.nextRunAt} />}
        <RunButton onClick={onRun} disabled={false} />
      </div>
    </div>
  );
}

function LastRunSummary({ last }: { last: PipelineRun }) {
  return (
    <>
      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-foreground">
        {relativeTime(last.startedAt)}
      </span>
      <TriggerChip trigger={last.trigger} />
      <span className="font-mono text-[11px] text-muted-foreground/60">·</span>
      <InlineStat label="Fetched" value={last.fetchAdded ?? 0} />
      <span className="font-mono text-[11px] text-muted-foreground/60">·</span>
      <InlineStat label="Analyzed" value={last.analyzeAnalyzed ?? 0} />
      <span className="font-mono text-[11px] text-muted-foreground/60">·</span>
      <InlineStat label="Summarized" value={last.summarizeSummarized ?? 0} />
    </>
  );
}

function InlineStat({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 font-mono">
      <span className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <span className="tabular text-[12px] font-medium text-foreground">{value}</span>
    </span>
  );
}

function TriggerChip({ trigger }: { trigger: PipelineTrigger }) {
  const Icon = trigger === "scheduler" ? Clock : Keyboard;
  const label = trigger === "scheduler" ? "Cron" : "Manual";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-border/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function NextPill({ nextRunAt }: { nextRunAt: string }) {
  // 30s local tick — the server-authoritative timestamp comes via the prop
  // (refreshed on mount + window focus). We just re-render the derived label
  // on each tick. Interval is scoped to this component so it only runs while
  // the pill is visible (idle view only).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const diffMs = new Date(nextRunAt).getTime() - now;
  return (
    <span className="inline-flex items-center gap-2 rounded-sm border border-border/70 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
      <Clock className="h-3 w-3 text-primary/80" />
      Next{" "}
      <span className="font-medium tracking-[0.08em] text-foreground">
        {formatCountdown(diffMs)}
      </span>
    </span>
  );
}

/**
 * Format a ms offset into a countdown label.
 *  - < 1 minute  → "any moment"
 *  - < 1 hour    → "in Nm"
 *  - exact hours → "in Nh"
 *  - otherwise   → "in Nh Mm"
 */
function formatCountdown(diffMs: number): string {
  if (diffMs < 60_000) return "any moment";
  const totalMin = Math.floor(diffMs / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `in ${m}m`;
  if (m === 0) return `in ${h}h`;
  return `in ${h}h ${m}m`;
}

function RunButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group inline-flex items-center gap-2 rounded-sm border border-primary/50 bg-primary/10 px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-primary transition-all",
        "hover:border-primary hover:bg-primary hover:text-primary-foreground",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-primary/50 disabled:hover:bg-primary/10 disabled:hover:text-primary",
      )}
    >
      Run pipeline
      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

// --- State badge (shared between idle + running views) ---

function StateBadge({ kind }: { kind: "idle" | "running" }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-r border-border/60 pr-5">
      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-foreground">
        Pipeline
      </span>
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          kind === "idle" ? "bg-success status-pulse" : "bg-primary pipeline-hot-pulse",
        )}
        aria-hidden
      />
      <span
        className={cn(
          "font-mono text-[10px] uppercase tracking-[0.2em]",
          kind === "idle" ? "text-muted-foreground" : "text-primary",
        )}
      >
        {kind === "idle" ? "Idle" : "Running"}
      </span>
    </div>
  );
}

// --- Running view ---

function RunningView({
  run,
  elapsedMs,
  cancelling,
  onCancel,
}: {
  run: RunProgress;
  elapsedMs: number;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const elapsed = formatElapsed(elapsedMs);
  const [mm, ss] = elapsed.split(":");

  return (
    <div className="space-y-4">
      {/* Top row: badge + elapsed + cancel */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <StateBadge kind="running" />
        <div className="flex items-baseline gap-3 border-l border-border/60 pl-5">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Elapsed
          </span>
          <span className="tabular font-mono text-[22px] font-medium leading-none text-foreground">
            {mm}
            <span className="pipeline-colon-blink text-primary">:</span>
            {ss}
          </span>
        </div>
        <div className="flex-1" />
        <CancelButton cancelling={cancelling} onClick={onCancel} />
      </div>

      {/* Phase indicator */}
      <PhaseIndicator run={run} />

      {/* Live article ticker — only when a per-article event has arrived */}
      {run.tickerPhase && (
        <div className="flex items-baseline gap-4 min-w-0">
          <span className="inline-flex items-center gap-2 shrink-0 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-primary">
            <span
              className="h-0 w-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-primary"
              aria-hidden
            />
            Now
          </span>
          <span
            className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[17px] leading-snug text-foreground italic"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {run.tickerTitle}
          </span>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            from <span className="font-medium text-foreground">{run.tickerFeed}</span>
          </span>
        </div>
      )}

      {/* Accumulating totals */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/40 pt-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/70">
          Run totals
        </span>
        <TotalStat
          label="Fetched"
          value={run.totals.fetchAdded}
          started={run.phase !== "fetch" || run.totals.fetchAdded > 0}
        />
        <TotalStat
          label="Analyzed"
          value={run.totals.analyzeAnalyzed}
          started={run.phase === "analyze" || run.phase === "summarize" || run.phase === "done"}
          inProgress={
            run.phase === "analyze" && run.analyzeIndex > 0 ? run.analyzeIndex : undefined
          }
        />
        <TotalStat
          label="Summarized"
          value={run.totals.summarizeSummarized}
          started={run.phase === "summarize" || run.phase === "done"}
          inProgress={
            run.phase === "summarize" && run.summarizeIndex > 0 ? run.summarizeIndex : undefined
          }
        />
        <div className="ml-auto inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.22em] text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary pipeline-hot-pulse" aria-hidden />
          Streaming
        </div>
      </div>
    </div>
  );
}

function TotalStat({
  label,
  value,
  started,
  inProgress,
}: {
  label: string;
  value: number;
  started: boolean;
  inProgress?: number;
}) {
  return (
    <span className="inline-flex items-baseline gap-2 font-mono">
      <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      {started ? (
        <span className="tabular text-[13px] font-medium text-foreground">
          {inProgress ?? value}
        </span>
      ) : (
        <span className="text-[13px] text-muted-foreground/50">—</span>
      )}
    </span>
  );
}

function CancelButton({ cancelling, onClick }: { cancelling: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={cancelling}
      className={cn(
        "inline-flex items-center gap-2 rounded-sm border border-destructive/50 bg-destructive/10 px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-destructive transition-all",
        "hover:border-destructive hover:bg-destructive hover:text-foreground",
        "disabled:cursor-wait disabled:opacity-70",
      )}
    >
      {cancelling ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <X className="h-3.5 w-3.5" />
      )}
      {cancelling ? "Cancelling" : "Cancel"}
    </button>
  );
}

// --- Phase indicator ---

function PhaseIndicator({ run }: { run: RunProgress }) {
  return (
    <div className="grid grid-cols-[1fr_1.45fr_1fr] overflow-hidden rounded-sm border border-border/60 bg-card/40">
      <PhaseCell
        num="01"
        label="Fetch"
        icon={Wand2}
        state={phaseStateOf("fetch", run)}
        meta={fetchPhaseMeta(run)}
        progress={fetchPhaseProgress(run)}
      />
      <PhaseCell
        num="02"
        label="Analyze"
        icon={Sparkles}
        state={phaseStateOf("analyze", run)}
        meta={analyzePhaseMeta(run)}
        progress={analyzePhaseProgress(run)}
      />
      <PhaseCell
        num="03"
        label="Summarize"
        icon={Sparkles}
        state={phaseStateOf("summarize", run)}
        meta={summarizePhaseMeta(run)}
        progress={summarizePhaseProgress(run)}
      />
    </div>
  );
}

// --- Phase meta / progress helpers (flattened to avoid nested ternaries) ---

function fetchPhaseMeta(run: RunProgress): string {
  if (run.totals.fetchAdded > 0 || run.phase !== "fetch") {
    return `${run.totals.fetchAdded} new`;
  }
  return "…";
}

function fetchPhaseProgress(run: RunProgress): number {
  if (run.phase === "fetch") return 40;
  if (phaseStateOf("fetch", run) === "done") return 100;
  return 0;
}

function analyzePhaseMeta(run: RunProgress): string {
  if (run.analyzeTotal > 0) return `${run.analyzeIndex} / ${run.analyzeTotal}`;
  if (run.totals.analyzeAnalyzed > 0) return String(run.totals.analyzeAnalyzed);
  return "—";
}

function analyzePhaseProgress(run: RunProgress): number {
  if (run.analyzeTotal > 0) {
    return Math.min(100, (run.analyzeIndex / run.analyzeTotal) * 100);
  }
  if (phaseStateOf("analyze", run) === "done") return 100;
  return 0;
}

function summarizePhaseMeta(run: RunProgress): string {
  if (run.summarizeTotal > 0) return `${run.summarizeIndex} / ${run.summarizeTotal}`;
  if (run.totals.summarizeSummarized > 0) return String(run.totals.summarizeSummarized);
  return "—";
}

function summarizePhaseProgress(run: RunProgress): number {
  if (run.summarizeTotal > 0) {
    return Math.min(100, (run.summarizeIndex / run.summarizeTotal) * 100);
  }
  if (phaseStateOf("summarize", run) === "done") return 100;
  return 0;
}

function PhaseCell({
  num,
  label,
  icon: Icon,
  state,
  meta,
  progress,
}: {
  num: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  state: PhaseState;
  meta: string;
  progress: number;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-2 px-4 py-3 border-r border-border/60 last:border-r-0",
        state === "active" && "bg-primary/[0.08]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          {state === "done" ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Icon
              className={cn(
                "h-3.5 w-3.5",
                state === "active" ? "text-primary" : "text-muted-foreground/50",
              )}
            />
          )}
          <span className="font-mono text-[9px] tracking-[0.22em] text-muted-foreground/60">
            {num}
          </span>
          <span
            className={cn(
              "font-mono text-[11px] font-medium uppercase tracking-[0.16em]",
              state === "upcoming" ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {label}
          </span>
        </div>
        <span
          className={cn(
            "tabular font-mono text-[11px] font-medium",
            state === "upcoming" ? "text-muted-foreground/50" : "text-foreground",
          )}
        >
          {meta}
        </span>
      </div>
      <div className="h-[2px] overflow-hidden rounded-sm bg-muted">
        <div
          className={cn(
            "pipeline-progress-bar h-full",
            state === "done" ? "bg-primary/55" : "bg-primary",
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
