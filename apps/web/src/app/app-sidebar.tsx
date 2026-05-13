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

import { ArrowLeft, Highlighter, Newspaper, Search, Settings, Zap } from "lucide-react";
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
  return isTopLevel(pathname) ? (
    <ShapeA pathname={pathname} contextualContent={contextualContent} />
  ) : (
    <ShapeB contextualContent={contextualContent} />
  );
}

function ShapeA({
  pathname,
  contextualContent,
}: {
  pathname: TopLevelRoute;
  contextualContent?: React.ReactNode;
}) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="px-2 py-2 font-display text-lg font-medium tracking-tight">HomeNews</div>
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

function ShapeB({ contextualContent }: { contextualContent?: React.ReactNode }) {
  const router = useRouter();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Back"
              onClick={() => {
                router.back();
              }}
            >
              <ArrowLeft />
              <span>Back</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>{contextualContent}</SidebarContent>
    </Sidebar>
  );
}
