import {
  formatSessionClearCookie,
  formatSessionSetCookie,
  insecurCsrfCookieAttributes,
  workosSessionCookieAttributes,
} from "@insecur/auth";
import { setResponseHeader } from "@tanstack/react-start/server";
import type { BrowserSessionRotation } from "./resolve-browser-actor.js";

export function applyBrowserSessionRotation(rotation: BrowserSessionRotation): void {
  setResponseHeader("Set-Cookie", [
    formatSessionSetCookie(workosSessionCookieAttributes, rotation.sealedSession),
    formatSessionSetCookie(insecurCsrfCookieAttributes, rotation.csrfToken),
  ]);
}

export function applyBrowserSessionClear(): void {
  setResponseHeader("Set-Cookie", [
    formatSessionClearCookie(workosSessionCookieAttributes),
    formatSessionClearCookie(insecurCsrfCookieAttributes),
  ]);
}
