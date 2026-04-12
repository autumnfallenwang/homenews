/** User theme preference. `system` follows the OS setting. */
export type Theme = "light" | "dark" | "system";

/** Concrete theme actually applied to the document. Never `system`. */
export type ResolvedTheme = "light" | "dark";

/** Cookie name used to persist the user preference for SSR fast-path. */
export const THEME_COOKIE = "homenews-theme";

/** DOM event name dispatched when the theme is changed (e.g. from settings page). */
export const THEME_EVENT = "homenews:theme-change";

/**
 * Resolve a Theme to a concrete light/dark class. For `system`, queries the
 * `prefers-color-scheme` media query. SSR-safe — falls back to `dark` when
 * `window` is undefined.
 */
export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "light" || theme === "dark") return theme;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Resolve a server-side cookie value (which may be light/dark/system or absent)
 * to a concrete class. Defaults to `dark` for `system` or unknown values since
 * the server has no way to read the user's OS preference.
 */
export function resolveThemeForSsr(cookieValue: string | undefined): ResolvedTheme {
  if (cookieValue === "light") return "light";
  // dark, system, or unset → dark
  return "dark";
}
