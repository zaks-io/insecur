import { useSyncExternalStore } from "react";

/**
 * Class-based dark mode (ADR-0083). The init script runs inline in <head> before first paint so
 * SSR'd pages never flash the wrong scheme; apps under a strict CSP must attach their script
 * nonce. Preference persists per-domain in localStorage and falls back to the OS scheme.
 */
export const THEME_STORAGE_KEY = "insecur.theme";

export const THEME_INIT_SCRIPT = `(function () { try { var t = localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)}); var d = t === "dark" || (t !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches); document.documentElement.classList.toggle("dark", d); } catch (e) {} })();`;

/** Flip the scheme and persist the choice. Returns true when the new scheme is dark. */
export function toggleTheme(): boolean {
  const dark = document.documentElement.classList.toggle("dark");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  } catch {
    // Storage can be unavailable (private mode); the in-page toggle still applies.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  return dark;
}

const THEME_CHANGE_EVENT = "insecur:theme";

function subscribeToTheme(onChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  };
}

function readThemeClass(): string {
  return document.documentElement.classList.contains("dark") ? "dark" : "";
}

const serverThemeClass = () => "";

/**
 * className for the root <html> element. Snapshots the class THEME_INIT_SCRIPT stamped before
 * hydration, so React's hydration render agrees with the DOM instead of wiping it (the shell
 * component owns <html>, and a bare element would hydrate the class away). Pair with
 * `suppressHydrationWarning` — the server always renders the light default.
 */
export function useThemeClass(): string {
  return useSyncExternalStore(subscribeToTheme, readThemeClass, serverThemeClass);
}
