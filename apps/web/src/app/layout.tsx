import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { resolveThemeForSsr, THEME_COOKIE, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { AppSidebar } from "./app-sidebar";
import { ThemeApplier } from "./theme-applier";
import "./globals.css";

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["opsz", "SOFT"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "HomeNews",
  description: "Personal AI news intelligence",
};

export default async function RootLayout({
  children,
  sidebar,
}: {
  children: React.ReactNode;
  // `sidebar` is the @sidebar parallel-route slot. Each top-level route can
  // contribute its own @sidebar/<route>/page.tsx; routes without one render
  // @sidebar/default.tsx (currently `null`). The slot content is server-
  // rendered with the route's searchParams, so URL-driven data (filters,
  // facets, etc.) flows in cleanly without a client-fetch waterfall.
  sidebar: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const themePref = (cookieStore.get(THEME_COOKIE)?.value ?? "dark") as Theme;
  const ssrClass = resolveThemeForSsr(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <html
      lang="en"
      className={cn(ssrClass, sans.variable, mono.variable, display.variable)}
      suppressHydrationWarning
    >
      <body className="font-sans bg-background text-foreground bg-grain min-h-screen">
        <ThemeApplier initialPref={themePref} />
        <TooltipProvider>
          <SidebarProvider>
            <AppSidebar contextualContent={sidebar} />
            <SidebarInset>{children}</SidebarInset>
          </SidebarProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
