"use client";

import type { Feed } from "@homenews/shared";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createFeed, deleteFeed, triggerFetchFeed } from "@/lib/api";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface FeedListProps {
  feeds: Feed[];
  setFeeds: React.Dispatch<React.SetStateAction<Feed[] | null>>;
  onCommit: (feedId: string, patch: Partial<Feed>) => void;
}

export function FeedList({ feeds, setFeeds, onCommit }: FeedListProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function handleDelete(feed: Feed) {
    if (!window.confirm(`Delete "${feed.name}" and all its articles?`)) return;
    setBusy(feed.id);
    try {
      await deleteFeed(feed.id);
      setFeeds((prev) => (prev ? prev.filter((f) => f.id !== feed.id) : prev));
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setBusy(null);
    }
  }

  async function handleFetch(feed: Feed) {
    setBusy(feed.id);
    try {
      await triggerFetchFeed(feed.id);
      router.refresh();
    } catch (err) {
      console.error("Fetch failed:", err);
    } finally {
      setBusy(null);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add");
    try {
      const created = await createFeed({
        name,
        url,
        category: category || undefined,
      });
      setFeeds((prev) => (prev ? [...prev, created] : [created]));
      setName("");
      setUrl("");
      setCategory("");
      setDialogOpen(false);
    } catch (err) {
      console.error("Create failed:", err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {/* Toolbar (no duplicate heading — ContentPane already shows the section title) */}
      <div className="mb-5 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {feeds.length} feed{feeds.length === 1 ? "" : "s"} configured
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Feed
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display text-[18px]">Add Feed</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="mt-2 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="TechCrunch AI"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url">RSS URL</Label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://example.com/feed.xml"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category (optional)</Label>
                <Input
                  id="category"
                  placeholder="ai-news"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy === "add"}>
                {busy === "add" ? "Adding..." : "Add Feed"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {feeds.length === 0 ? (
        <p className="py-12 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          No feeds configured yet. Add one to get started.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead title="Per-feed weight in the composite score (0-1)">Authority</TableHead>
              <TableHead title="Per-feed share of the analyze batch budget (0 = never analyze)">
                Analyze
              </TableHead>
              <TableHead>Last Fetched</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {feeds.map((feed) => {
              return (
                <TableRow key={feed.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{feed.name}</div>
                      <div className="max-w-xs truncate text-xs text-muted-foreground">
                        {feed.url}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{feed.category ?? "—"}</TableCell>
                  <TableCell>
                    <Switch
                      checked={feed.enabled}
                      onCheckedChange={(v) => onCommit(feed.id, { enabled: v })}
                    />
                  </TableCell>
                  <TableCell>
                    <WeightInput
                      id={`authority-${feed.id}`}
                      value={feed.authorityScore}
                      onChange={(v) => onCommit(feed.id, { authorityScore: v })}
                    />
                  </TableCell>
                  <TableCell>
                    <WeightInput
                      id={`analyze-weight-${feed.id}`}
                      value={feed.analyzeWeight}
                      onChange={(v) => onCommit(feed.id, { analyzeWeight: v })}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(feed.lastFetchedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleFetch(feed)}
                        disabled={busy === feed.id}
                        title="Fetch now"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(feed)}
                        disabled={busy === feed.id}
                        title="Delete feed"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/**
 * Generic weight input — used by both the Authority and Analyze columns.
 * Local state shadows the controlled value so the user can type freely;
 * the value commits on blur, and re-syncs from the prop when the input
 * loses focus (e.g. after a Cancel-from-SaveBar reset).
 */
function WeightInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [local, setLocal] = useState(String(value));
  const currentStr = String(value);

  if (local !== currentStr && document.activeElement?.id !== id) {
    setLocal(currentStr);
  }

  function commit() {
    const num = Number.parseFloat(local);
    if (Number.isFinite(num) && num >= 0 && num <= 1) {
      if (num !== value) onChange(num);
      setLocal(String(num));
    } else {
      setLocal(currentStr);
    }
  }

  return (
    <Input
      id={id}
      type="number"
      min={0}
      max={1}
      step={0.05}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      className="h-8 w-20"
    />
  );
}
