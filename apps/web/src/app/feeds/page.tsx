import type { Feed } from "@homenews/shared";
import { fetchFeeds } from "@/lib/api";
import { FeedList } from "./feed-list";

export default async function FeedsPage() {
  let feeds: Feed[] = [];
  try {
    feeds = await fetchFeeds();
  } catch {
    // API unavailable — show empty state
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <FeedList initialFeeds={feeds} />
    </main>
  );
}
