"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useNavigation } from "./dashboard-shell";

export function ArticleListShell({ children }: { children: ReactNode }) {
  const { isPending } = useNavigation();
  return (
    <div
      className={cn(
        "relative border-t border-border transition-opacity duration-200",
        isPending && "opacity-55",
      )}
    >
      {isPending && <div aria-hidden className="filterbar-shimmer-overlay" />}
      {children}
    </div>
  );
}
