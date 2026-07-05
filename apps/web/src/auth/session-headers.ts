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
