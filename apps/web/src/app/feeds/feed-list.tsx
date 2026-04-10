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
import { createFeed, deleteFeed, triggerFetchFeed, updateFeed } from "@/lib/api";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FeedList({ initialFeeds }: { initialFeeds: Feed[] }) {
  const router = useRouter();
  const [feeds, setFeeds] = useState(initialFeeds);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function handleToggle(feed: Feed) {
    setBusy(feed.id);
    try {
      const updated = await updateFeed(feed.id, { enabled: !feed.enabled });
      setFeeds((prev) => prev.map((f) => (f.id === feed.id ? updated : f)));
    } catch (err) {
      console.error("Toggle failed:", err);
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(feed: Feed) {
    if (!window.confirm(`Delete "${feed.name}" and all its articles?`)) return;
    setBusy(feed.id);
    try {
      await deleteFeed(feed.id);
      setFeeds((prev) => prev.filter((f) => f.id !== feed.id));
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
      setFeeds((prev) => [...prev, created]);
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Manage Feeds</h1>
          <p className="text-muted-foreground mt-1">
            {feeds.length} feed{feeds.length === 1 ? "" : "s"} configured
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="h-4 w-4 mr-2" />
            Add Feed
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Feed</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 mt-2">
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
        <p className="text-muted-foreground text-center py-12">
          No feeds configured yet. Add one to get started.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead>Last Fetched</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {feeds.map((feed) => (
              <TableRow key={feed.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{feed.name}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-xs">
                      {feed.url}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{feed.category ?? "—"}</TableCell>
                <TableCell>
                  <Switch
                    checked={feed.enabled}
                    onCheckedChange={() => handleToggle(feed)}
                    disabled={busy === feed.id}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
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
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
