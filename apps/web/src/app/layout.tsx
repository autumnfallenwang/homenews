import { Newspaper } from "lucide-react";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "HomeNews",
  description: "Personal AI news intelligence",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-6">
            <Link href="/" className="flex items-center gap-2">
              <Newspaper className="h-5 w-5" />
              <span className="text-lg font-semibold">HomeNews</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/" className="font-medium text-foreground">
                Dashboard
              </Link>
              <Link
                href="/feeds"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Feeds
              </Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
