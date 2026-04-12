import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import Link from "next/link";
import { resolveThemeForSsr, THEME_COOKIE, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
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
        <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-6">
            <Link
              href="/"
              className="group flex items-baseline gap-2 select-none"
              aria-label="HomeNews home"
            >
              <span className="font-display text-xl font-medium tracking-tight text-foreground">
                Home<span className="text-primary">News</span>
              </span>
              <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:inline">
                v0.5
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-[13px]">
              <NavLink href="/" label="Dashboard" />
              <NavLink href="/settings" label="Settings" />
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground md:inline">
                Workstation
              </span>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-sm px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground transition-colors",
        "hover:text-foreground hover:bg-secondary/60",
      )}
    >
      {label}
    </Link>
  );
}
