"use client";

import { useEffect } from "react";
import { resolveTheme, THEME_COOKIE, THEME_EVENT, type Theme } from "@/lib/theme";

/**
 * Dispatch a theme change so the mounted ThemeApplier picks it up. Call this
 * from anywhere in the client tree (e.g. settings save handler) after
 * persisting the new value.
 */
export function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  // Persist preference cookie immediately so the next SSR uses it
  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API not yet universal; document.cookie is the standard fallback
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

/**
 * Mounted in the root layout. Owns runtime theme state:
 * - Applies the user's preference (resolved → light/dark) to <html>
 * - Listens for `homenews:theme-change` events from the settings page
 * - When in `system` mode, listens for OS theme changes via media query
 *
 * Receives the initial preference from the server-side cookie via prop.
 */
export function ThemeApplier({ initialPref }: { initialPref: Theme }) {
  useEffect(() => {
    let currentPref: Theme = initialPref;

    function applyResolved(pref: Theme) {
      const resolved = resolveTheme(pref);
      const html = document.documentElement;
      if (!html.classList.contains(resolved)) {
        html.classList.remove("light", "dark");
        html.classList.add(resolved);
      }
    }

    // Reapply on mount in case the server-rendered class differs from what the
    // user's preference resolves to right now (e.g. system mode + OS toggled
    // between sessions).
    applyResolved(currentPref);

    function handleThemeChange(e: Event) {
      const detail = (e as CustomEvent<Theme>).detail;
      currentPref = detail;
      applyResolved(detail);
    }
    window.addEventListener(THEME_EVENT, handleThemeChange);

    // React to OS theme changes when in system mode
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    function handleSystemChange() {
      if (currentPref === "system") applyResolved("system");
    }
    mq.addEventListener("change", handleSystemChange);

    return () => {
      window.removeEventListener(THEME_EVENT, handleThemeChange);
      mq.removeEventListener("change", handleSystemChange);
    };
  }, [initialPref]);

  return null;
}
