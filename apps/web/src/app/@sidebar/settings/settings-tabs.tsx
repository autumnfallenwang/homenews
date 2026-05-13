"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

// Tab IDs + labels mirror TABS in apps/web/src/app/settings/settings-form.tsx.
// Kept inline rather than imported because the form file is a client component
// boundary with dirty-tracking + save logic that we don't want to drag into
// the sidebar slot. If labels drift, it's a visual nit; the form file is the
// source of truth for which tab keys exist + their dirty state.
const TABS: { id: string; label: string }[] = [
  { id: "scoring", label: "Scoring" },
  { id: "freshness", label: "Freshness" },
  { id: "scheduler", label: "Scheduler" },
  { id: "models", label: "LLM Models" },
  { id: "tags", label: "Tag Vocabulary" },
  { id: "theme", label: "Theme" },
  { id: "feeds", label: "Feeds" },
];

const DEFAULT_TAB = "scoring";

export function SettingsTabsNav() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? DEFAULT_TAB;

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <ul className="flex flex-col">
          {TABS.map((tab, index) => {
            const active = tab.id === activeTab;
            return (
              <li key={tab.id}>
                <Link
                  href={`/settings?tab=${tab.id}`}
                  className={cn(
                    "block rounded-sm px-3 py-1.5 text-[13px] transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )}
                  // Pre-empt the default flat-list focus order so the
                  // first item is reachable from the Back row above.
                  tabIndex={index === 0 ? 0 : -1}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
