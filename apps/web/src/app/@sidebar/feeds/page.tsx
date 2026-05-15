// @sidebar slot for /feeds — no contextual content.
//
// Same rationale as the other top-level slot pages: explicit empty page so
// soft client navigation produces a consistent parallel-route tree and the
// dashboard's filter accordion does not leak into other routes.

export default function FeedsSidebar() {
  return null;
}
