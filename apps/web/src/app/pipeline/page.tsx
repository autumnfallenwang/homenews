import { PipelineControl } from "../pipeline-control";

// Phase 18 Task 122 — pipeline gets its own top-level route. Previously
// `<PipelineControl />` rode at the top of the dashboard; that put live
// run chrome in the way of "what should I read next" browsing. Moved
// here so the dashboard is purely a reading surface and operators get a
// dedicated room for trace + history.
//
// PipelineControl owns:
//   - Active-run trace via /admin/pipeline/stream SSE (re-attach via
//     /admin/pipeline/status on mount, the Phase 12 contract).
//   - Recent-run history (embedded PipelineHistory subcomponent, polls
//     /admin/pipeline/runs every 60s, drill-down per run).
//
// The sidebar contextual zone for this route is empty for now; an
// at-a-glance "last run" / "next run" card could land here once the
// injection mechanism is built (Task 123 sets it up for filters).

export default function PipelinePage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-10">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Pipeline
        </span>
        <h1 className="mt-3 font-display text-[2.75rem] leading-[1.05] tracking-tight text-foreground">
          Run trace and history.
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Watch the current run unfold phase-by-phase, or step back through past runs to inspect
          counts, durations, and any failures.
        </p>
      </header>
      <PipelineControl />
    </main>
  );
}
