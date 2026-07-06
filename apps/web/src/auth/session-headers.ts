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
  applyAuthedDocumentCacheHeaders(resolved);
  const cookieHeaders = browserSessionCookieHeadersFromResolveResult(resolved);
  if (cookieHeaders.length === 0) {
    return;
  }
  setResponseHeader("Set-Cookie", [...cookieHeaders]);
}

/**
 * Per-request cache directive for authed console SSR documents. A successful browser-actor
 * resolution means an authed console document is being rendered; its 200 HTML embeds per-user org
 * metadata (display names, opaque IDs), so it must never be cached by an intermediary or the
 * browser cache. Emitting here — the finalize path every actor resolution runs through
 * (`finalizeBrowserActorResult`) — makes "any successful authed resolution stamps no-store" a
 * structural invariant: no session primitive needs fencing, because any loader that resolves an
 * actor at all gets the header. Fires only on `ok`; the unauthenticated and INS-412 fail-closed
 * paths render a redirect/login that owns its own `no-store` (browser-oauth.ts), so they are left
 * alone. `Vary: Cookie` keeps a shared cache from serving one actor's document to another.
 */
function applyAuthedDocumentCacheHeaders(resolved: ResolveBrowserActorResult): void {
  if (!resolved.ok) {
    return;
  }
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("Vary", "Cookie");
}
