import { redirectResponse } from "./browser-oauth.js";
import type { ResolveBrowserActorResult } from "./resolve-browser-actor.js";
import { browserSessionCookieHeadersFromResolveResult } from "./session-headers.js";

const WHOAMI_RETURN_TO = "/whoami";

export function unauthenticatedWhoamiRedirect(
  resolved: ResolveBrowserActorResult,
): Response | null {
  if (resolved.ok) {
    return null;
  }
  return redirectResponse(
    `/login?returnTo=${encodeURIComponent(WHOAMI_RETURN_TO)}`,
    browserSessionCookieHeadersFromResolveResult(resolved),
  );
}
