import {
  formatSessionClearCookie,
  formatSessionSetCookie,
  insecurCsrfCookieAttributes,
  workosSessionCookieAttributes,
} from "@insecur/auth";
import { setResponseHeader } from "@tanstack/react-start/server";
import type { BrowserSessionRotation, ResolveBrowserActorResult } from "./resolve-browser-actor.js";

function applyBrowserSessionRotation(rotation: BrowserSessionRotation): void {
  setResponseHeader("Set-Cookie", [
    formatSessionSetCookie(workosSessionCookieAttributes, rotation.sealedSession),
    formatSessionSetCookie(insecurCsrfCookieAttributes, rotation.csrfToken),
  ]);
}

function applyBrowserSessionClear(): void {
  setResponseHeader("Set-Cookie", [
    formatSessionClearCookie(workosSessionCookieAttributes),
    formatSessionClearCookie(insecurCsrfCookieAttributes),
  ]);
}

export function applyBrowserSessionFromResolveResult(resolved: ResolveBrowserActorResult): void {
  if (!resolved.ok) {
    if (resolved.clearSession === true) {
      applyBrowserSessionClear();
    }
    return;
  }
  if (resolved.rotation !== undefined) {
    applyBrowserSessionRotation(resolved.rotation);
  }
}
