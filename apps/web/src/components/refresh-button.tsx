"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

// Small client-component button for page-header refresh slots. Calls
// router.refresh() to re-run the server component (re-fetching the
// page's data) without a full reload. Uses useTransition so the button
// can show a spinner while the server pass is pending.

export function RefreshButton({ label = "Refresh" }: { label?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={isPending}
      className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-40"
      aria-label={label}
    >
      <RefreshCw className={cn("h-3 w-3", isPending && "animate-spin")} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
