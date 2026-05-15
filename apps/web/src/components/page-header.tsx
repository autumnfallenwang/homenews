import type { ReactNode } from "react";
import { SidebarOpenTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

// Slim sticky page header — see docs/ui-shell-memo.md ("Page header").
// One row, three slots: title (left) · status (middle) · actions (right).
// Sticky top-0 so it stays pinned while the page scrolls underneath. Hard
// rules: no folded panels, no filter controls, no second row. Anything
// complex belongs in the sidebar contextual zone.

export function PageHeader({
  title,
  status,
  actions,
  className,
}: {
  title: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur",
        className,
      )}
    >
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-4 px-6">
        <SidebarOpenTrigger className="-ml-1" />
        <h1 className="truncate font-mono text-[11px] uppercase tracking-[0.2em] text-foreground">
          {title}
        </h1>
        {status !== undefined && (
          <div className="hidden min-w-0 flex-1 truncate font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground sm:block">
            {status}
          </div>
        )}
        {actions !== undefined && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
