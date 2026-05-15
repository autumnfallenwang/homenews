// @sidebar slot for /highlights — no contextual content.
//
// Explicit empty page (rather than relying on @sidebar/default.tsx) so that
// soft client-side navigation from the dashboard clears the filter accordion.
// default.tsx only fires on hard navigation; without this file the parallel-
// route slot keeps rendering the dashboard's content after a client nav.

export default function HighlightsSidebar() {
  return null;
}
