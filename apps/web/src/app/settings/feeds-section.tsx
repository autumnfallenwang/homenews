"use client";

import type { Feed } from "@homenews/shared";
import { useEffect, useState } from "react";
import { fetchFeeds, updateFeed } from "@/lib/api";
import { FeedList } from "./feed-list";

// FeedsSection — auto-save model. Each toggle / weight edit commits to the
// server immediately; there's no save-bar gate anymore. State is the live
// `feeds` array; on a row edit we optimistically update, POST, and revert
// on failure.

export function FeedsSection() {
  const [feeds, setFeeds] = useState<Feed[] | null>(null);

  useEffect(() => {
    fetchFeeds()
      .then(setFeeds)
      .catch(() => setFeeds([]));
  }, []);

  async function commitFeed(feedId: string, patch: Partial<Feed>) {
    const prev = feeds;
    if (!prev) return;
    const before = prev.find((f) => f.id === feedId);
    if (!before) return;
    setFeeds(prev.map((f) => (f.id === feedId ? { ...f, ...patch } : f)));
    try {
      const updated = await updateFeed(feedId, patch);
      setFeeds((s) => (s ? s.map((f) => (f.id === feedId ? updated : f)) : s));
    } catch (err) {
      console.error(`Save feed ${feedId} failed:`, err);
      setFeeds((s) => (s ? s.map((f) => (f.id === feedId ? before : f)) : s));
    }
  }

  if (feeds === null) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        Loading feeds…
      </p>
    );
  }

  return <FeedList feeds={feeds} setFeeds={setFeeds} onCommit={commitFeed} />;
}
