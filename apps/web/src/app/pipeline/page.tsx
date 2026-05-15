import { PageHeader } from "@/components/page-header";
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
  // Status indicator + Run-now button live inside PipelineControl (it owns
  // the SSE stream + status polling). The slim header here is title-only so
  // the section keeps a single source of truth for active-run state.
  return (
    <>
      <PageHeader title="Pipeline" status="Run trace and history" />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <PipelineControl />
      </main>
    </>
  );
}
