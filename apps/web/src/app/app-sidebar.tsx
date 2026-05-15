"use client";

// AppSidebar — route-aware shell for the Phase 18 redesign.
//
// Two shapes, decided from `usePathname()`:
//   Shape A — top-level pages (/, /search, /highlights, /pipeline):
//     brand + primary nav + empty contextual zone + Settings footer.
//   Shape B — sub-pages (/settings, /article/*, anything else):
//     Back row + empty content zone. No footer.
//
// The contextual zones are placeholders in this task. Page-specific
// content (dashboard filter accordion, settings sub-tabs, etc.) lands
// in later Phase 18 tasks.
//
// See docs/ui-shell-memo.md for the locked design.

import {
  ArrowLeft,
  Highlighter,
  Newspaper,
  PanelLeftClose,
  Search,
  Settings,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

const TOP_LEVEL_ROUTES = ["/", "/search", "/highlights", "/pipeline"] as const;

type TopLevelRoute = (typeof TOP_LEVEL_ROUTES)[number];

function isTopLevel(pathname: string): pathname is TopLevelRoute {
  return (TOP_LEVEL_ROUTES as readonly string[]).includes(pathname);
}

type NavItem = {
  href: TopLevelRoute;
  label: string;
  icon: typeof Newspaper;
};

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Dashboard", icon: Newspaper },
  { href: "/search", label: "Search", icon: Search },
  { href: "/highlights", label: "Highlights", icon: Highlighter },
  { href: "/pipeline", label: "Pipeline", icon: Zap },
] as const;

export function AppSidebar({ contextualContent }: { contextualContent?: React.ReactNode }) {
  const pathname = usePathname();
  if (isTopLevel(pathname)) {
    return <ShapeA pathname={pathname} contextualContent={contextualContent} />;
  }
  // Settings is a top-level destination from anywhere, so its Back goes
  // straight to the dashboard rather than the prior history entry (which
  // is often another settings sub-page after tab clicks).
  const backHref = pathname.startsWith("/settings") ? "/" : null;
  return <ShapeB backHref={backHref} contextualContent={contextualContent} />;
}

function ShapeA({
  pathname,
  contextualContent,
}: {
  pathname: TopLevelRoute;
  contextualContent?: React.ReactNode;
}) {
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarRail />
      <SidebarHeader>
        <Link
          href="/"
          className="block rounded-sm px-2 py-2 font-display text-lg font-medium tracking-tight transition-colors hover:text-primary"
        >
          HomeNews
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={pathname === item.href}
                      tooltip={item.label}
                      render={<Link href={item.href} />}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {contextualContent}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <CollapseSidebarButton />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Settings" render={<Link href="/settings" />}>
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function ShapeB({
  backHref,
  contextualContent,
}: {
  backHref: string | null;
  contextualContent?: React.ReactNode;
}) {
  const router = useRouter();
  const backButton = backHref ? (
    <SidebarMenuButton tooltip="Back" render={<Link href={backHref} />}>
      <ArrowLeft />
      <span>Back</span>
    </SidebarMenuButton>
  ) : (
    <SidebarMenuButton
      tooltip="Back"
      onClick={() => {
        router.back();
      }}
    >
      <ArrowLeft />
      <span>Back</span>
    </SidebarMenuButton>
  );
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarRail />
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>{backButton}</SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>{contextualContent}</SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <CollapseSidebarButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

// Manual fold button — pinned to the sidebar footer (just above Settings in
// Shape A; alone in Shape B). Mirrors the page-header hamburger that brings
// the rail back, so the user always has an explicit toggle on either side
// of the open/closed transition.
function CollapseSidebarButton() {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label="Collapse sidebar"
      title="Collapse sidebar"
      className="flex h-8 w-8 items-center justify-center rounded-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
    >
      <PanelLeftClose className="h-4 w-4" />
    </button>
  );
}
