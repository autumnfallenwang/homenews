"use client";

import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  Newspaper,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useState } from "react";
import {
  type AnalyzePipelineResult,
  type FetchPipelineResult,
  type SummarizePipelineResult,
  triggerPipelineAnalyze,
  triggerPipelineFetch,
  triggerPipelineRunAll,
  triggerPipelineSummarize,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type Stage = "fetch" | "analyze" | "summarize" | "run-all";

interface PipelineState {
  fetch?: FetchPipelineResult;
  analyze?: AnalyzePipelineResult;
  summarize?: SummarizePipelineResult;
  lastRunAt?: string;
  error?: string;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function PipelineControl() {
  const [busy, setBusy] = useState<Stage | null>(null);
  const [stats, setStats] = useState<PipelineState>({});

  async function run<T>(stage: Stage, fn: () => Promise<T>, key: keyof PipelineState) {
    setBusy(stage);
    try {
      const r = await fn();
      setStats((prev) => ({
        ...prev,
        [key]: r,
        lastRunAt: new Date().toISOString(),
        error: undefined,
      }));
    } catch (err) {
      setStats({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function runFetch() {
    await run("fetch", triggerPipelineFetch, "fetch");
  }
  async function runAnalyze() {
    await run("analyze", () => triggerPipelineAnalyze(), "analyze");
  }
  async function runSummarize() {
    await run("summarize", () => triggerPipelineSummarize(), "summarize");
  }
  async function runAll() {
    setBusy("run-all");
    try {
      const r = await triggerPipelineRunAll();
      setStats({
        fetch: r.fetch,
        analyze: r.analyze,
        summarize: r.summarize,
        lastRunAt: new Date().toISOString(),
      });
    } catch (err) {
      setStats({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  const isRunning = busy !== null;
  const hasResult = stats.fetch || stats.analyze || stats.summarize || stats.error;

  return (
    <section
      className={cn(
        "relative border-y border-border bg-card/40",
        isRunning && "shadow-[inset_3px_0_0_0_var(--primary)]",
      )}
      aria-label="Pipeline control"
    >
      {/* Top status row */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Pipeline
          </span>
          <span
            className={cn(
              "inline-flex h-1.5 w-1.5 rounded-full",
              isRunning ? "bg-primary status-pulse text-primary" : "bg-success",
            )}
            aria-hidden
          />
          <span className="font-mono text-[11px] uppercase tracking-wider text-foreground">
            {isRunning ? "Running" : "Idle"}
          </span>
        </div>

        <Separator />

        {hasResult ? (
          <StatsLine stats={stats} />
        ) : (
          <span className="font-mono text-[11px] text-muted-foreground">
            No runs this session — trigger a step below
          </span>
        )}
      </div>

      {/* Action row */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-6 pb-4 pt-1">
        <SegmentedControls
          busy={busy}
          onFetch={runFetch}
          onAnalyze={runAnalyze}
          onSummarize={runSummarize}
        />

        <RunAllButton
          busy={busy === "run-all"}
          disabled={isRunning && busy !== "run-all"}
          onClick={runAll}
        />
      </div>
    </section>
  );
}

function Separator() {
  return <span className="h-3 w-px bg-border" aria-hidden />;
}

function StatsLine({ stats }: { stats: PipelineState }) {
  if (stats.error) {
    return (
      <span className="flex items-center gap-1.5 font-mono text-[11px] text-destructive">
        <AlertTriangle className="h-3 w-3" />
        {stats.error}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
      {stats.lastRunAt && (
        <span className="flex items-center gap-1 text-foreground/80">
          <Check className="h-3 w-3 text-success" />
          {relativeTime(stats.lastRunAt)}
        </span>
      )}
      {stats.fetch && (
        <Stat label="Fetched" value={stats.fetch.added} secondary={`${stats.fetch.feeds} feeds`} />
      )}
      {stats.analyze && <Stat label="Analyzed" value={stats.analyze.analyzed} />}
      {stats.summarize && <Stat label="Summarized" value={stats.summarize.summarized} />}
    </div>
  );
}

function Stat({ label, value, secondary }: { label: string; value: number; secondary?: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-muted-foreground/80">·</span>
      <span className="text-muted-foreground/80">{label.toLowerCase()}</span>
      <span className="tabular text-foreground">{value}</span>
      {secondary && <span className="text-muted-foreground/60">({secondary})</span>}
    </span>
  );
}

function SegmentedControls({
  busy,
  onFetch,
  onAnalyze,
  onSummarize,
}: {
  busy: Stage | null;
  onFetch: () => void;
  onAnalyze: () => void;
  onSummarize: () => void;
}) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-sm border border-border bg-secondary/30">
      <SegmentBtn
        label="Fetch"
        icon={<Newspaper className="h-3.5 w-3.5" />}
        onClick={onFetch}
        loading={busy === "fetch"}
        disabled={busy !== null && busy !== "fetch"}
      />
      <span className="w-px bg-border" aria-hidden />
      <SegmentBtn
        label="Analyze"
        icon={<Wand2 className="h-3.5 w-3.5" />}
        onClick={onAnalyze}
        loading={busy === "analyze"}
        disabled={busy !== null && busy !== "analyze"}
      />
      <span className="w-px bg-border" aria-hidden />
      <SegmentBtn
        label="Summarize"
        icon={<Sparkles className="h-3.5 w-3.5" />}
        onClick={onSummarize}
        loading={busy === "summarize"}
        disabled={busy !== null && busy !== "summarize"}
      />
    </div>
  );
}

function SegmentBtn({
  label,
  icon,
  onClick,
  loading,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex items-center gap-2 px-4 py-2 font-mono text-[11px] uppercase tracking-wider transition-all",
        "text-muted-foreground hover:bg-background hover:text-foreground",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground",
        loading && "bg-background text-primary",
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function RunAllButton({
  busy,
  disabled,
  onClick,
}: {
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        "group ml-auto inline-flex items-center gap-2 rounded-sm border border-primary/50 bg-primary/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-primary transition-all",
        "hover:border-primary hover:bg-primary hover:text-primary-foreground",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary/10 disabled:hover:text-primary",
      )}
    >
      {busy ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Running pipeline
        </>
      ) : (
        <>
          Run full pipeline
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </>
      )}
    </button>
  );
}
