// @sidebar/page.tsx — dashboard's sidebar contextual content.
//
// Server component. Fetches feeds + ranked-with-facets the same way
// app/page.tsx does — Next.js auto-dedups identical fetches inside a
// single request, so this is one network call per resource, not two.
//
// Renders the FilterAccordion client component with the data it needs.
// URL state lives in searchParams (same source of truth as the dashboard
// main page).

import { ALLOWED_TAGS, type Feed, type RankedFacets } from "@homenews/shared";
import { fetchFeeds, fetchRanked } from "@/lib/api";
import { FilterAccordion } from "./filter-accordion";

const PAGE_SIZE = 50;

type RawSearchParams = Record<string, string | string[] | undefined>;

function getOne(sp: RawSearchParams, key: string): string | undefined {
  const v = sp[key];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default async function DashboardSidebar({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const csv = (k: string) => {
    const v = getOne(sp, k);
    return v ? v.split(",").filter(Boolean) : undefined;
  };
  const num = (k: string) => {
    const v = getOne(sp, k);
    return v === undefined ? undefined : Number(v);
  };
  const filters = {
    q: getOne(sp, "q"),
    sources: csv("sources"),
    categories: csv("categories"),
    tags: csv("tags"),
    composite_gte: num("composite_gte"),
    relevance_gte: num("relevance_gte"),
    importance_gte: num("importance_gte"),
    published_at_gte: getOne(sp, "published_at_gte"),
    published_at_lte: getOne(sp, "published_at_lte"),
    sort: getOne(sp, "sort"),
  };
  const rawOffset = Number(getOne(sp, "offset") ?? 0);
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;

  let feeds: Feed[] = [];
  let facets: RankedFacets | null = null;
  try {
    const [feedsList, rankedRes] = await Promise.all([
      fetchFeeds(),
      fetchRanked({ ...filters, limit: PAGE_SIZE, offset, includeFacets: true }),
    ]);
    feeds = feedsList;
    facets = rankedRes.facets ?? null;
  } catch {
    // API unavailable — render the accordion with no facet data
  }

  const availableSources = [...new Set(feeds.filter((f) => f.enabled).map((f) => f.name))].sort();
  const availableCategories = [
    ...new Set(feeds.map((f) => f.category).filter((c): c is string => Boolean(c))),
  ].sort();
  const availableTags = [...ALLOWED_TAGS];

  return (
    <FilterAccordion
      initialFilters={filters}
      availableSources={availableSources}
      availableCategories={availableCategories}
      availableTags={availableTags}
      facets={facets}
    />
  );
}
