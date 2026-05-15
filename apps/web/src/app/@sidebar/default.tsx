// Parallel-route fallback for the `@sidebar` slot. Renders nothing for routes
// that don't have their own sidebar contextual content (e.g. /search,
// /highlights, /pipeline, /article/[id] for now). Each of those can add
// its own @sidebar/<route>/page.tsx later.
//
// Required by Next.js: when an @-slot exists, every route through the
// layout must resolve to either a matching @sidebar/<route>/page.tsx or
// this default.tsx — otherwise the layout fails to render.

export default function DefaultSidebarSlot() {
  return null;
}
