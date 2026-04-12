"use client";

import type { Feed } from "@homenews/shared";
import { useEffect, useRef, useState } from "react";
import { fetchFeeds, updateFeed } from "@/lib/api";
import { type FeedEdit, FeedList } from "./feed-list";

export interface FeedsSectionActions {
  save: () => Promise<void>;
  cancel: () => void;
}

export function FeedsSection({
  actionsRef,
  onDirtyChange,
}: {
  actionsRef: React.MutableRefObject<FeedsSectionActions | null>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [feeds, setFeeds] = useState<Feed[] | null>(null);
  const [pendingEdits, setPendingEdits] = useState<Record<string, FeedEdit>>({});

  // Snapshot the latest pendingEdits + feeds in refs so the actions object
  // exposed to the parent always has up-to-date closures without having to
  // re-register on every keystroke.
  const pendingRef = useRef(pendingEdits);
  const feedsRef = useRef(feeds);
  pendingRef.current = pendingEdits;
  feedsRef.current = feeds;

  useEffect(() => {
    fetchFeeds()
      .then(setFeeds)
      .catch(() => setFeeds([]));
  }, []);

  const dirty = Object.keys(pendingEdits).length > 0;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    actionsRef.current = {
      save: async () => {
        const edits = pendingRef.current;
        const ids = Object.keys(edits);
        if (ids.length === 0) return;
        for (const id of ids) {
          const updated = await updateFeed(id, edits[id]);
          setFeeds((prev) => (prev ? prev.map((f) => (f.id === id ? updated : f)) : prev));
        }
        setPendingEdits({});
      },
      cancel: () => setPendingEdits({}),
    };
    return () => {
      actionsRef.current = null;
    };
  }, [actionsRef]);

  if (feeds === null) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        Loading feeds…
      </p>
    );
  }

  return (
    <FeedList
      feeds={feeds}
      setFeeds={setFeeds}
      pendingEdits={pendingEdits}
      setPendingEdits={setPendingEdits}
    />
  );
}
