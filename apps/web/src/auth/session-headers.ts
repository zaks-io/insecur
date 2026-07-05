import {
  formatSessionClearCookie,
  formatSessionSetCookie,
  insecurCsrfCookieAttributes,
  workosSessionCookieAttributes,
} from "@insecur/auth";
import { setResponseHeader } from "@tanstack/react-start/server";
import type { BrowserSessionRotation, ResolveBrowserActorResult } from "./resolve-browser-actor.js";

export function browserSessionCookieHeadersFromResolveResult(
  resolved: ResolveBrowserActorResult,
): readonly string[] {
  if (!resolved.ok) {
    if (resolved.clearSession !== true) {
      return [];
    }
    return [
      formatSessionClearCookie(workosSessionCookieAttributes),
      formatSessionClearCookie(insecurCsrfCookieAttributes),
    ];
  }
  if (resolved.rotation === undefined) {
    return [];
  }
  return browserSessionRotationCookieHeaders(resolved.rotation);
}

function browserSessionRotationCookieHeaders(rotation: BrowserSessionRotation): readonly string[] {
  return [
    formatSessionSetCookie(workosSessionCookieAttributes, rotation.sealedSession),
    formatSessionSetCookie(insecurCsrfCookieAttributes, rotation.csrfToken),
  ];
}

export function applyBrowserSessionFromResolveResult(resolved: ResolveBrowserActorResult): void {
  const cookieHeaders = browserSessionCookieHeadersFromResolveResult(resolved);
  if (cookieHeaders.length === 0) {
    return;
  }
  setResponseHeader("Set-Cookie", [...cookieHeaders]);
}

/**
 * Per-request cache directive for authed console SSR documents. These 200 HTML responses embed
 * per-user org metadata (display names, opaque IDs), so they must never be cached by an
 * intermediary or the browser cache. Emitted from the single authed-read chokepoint
 * (`resolveAuthenticatedApiClient`) so a new authed console route inherits the header without a
 * per-route copy; `Vary: Cookie` keeps a shared cache from serving one actor's document to another.
 * Redirect and Set-Cookie responses set their own `no-store` (browser-oauth.ts) and are unaffected.
 */
export function applyAuthedDocumentCacheHeaders(): void {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("Vary", "Cookie");
}
