import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import type { UserActor } from "@insecur/auth";
import { apiClientFor } from "@insecur/worker-kit/api-client";
import { resolveBrowserActor } from "../auth/resolve-browser-actor.js";
import { applyAuthedDocumentCacheHeaders } from "../auth/session-headers.js";
import type { WebEnv } from "../env.js";

export type BffApiClient = ReturnType<typeof apiClientFor>;

/**
 * Server-fn prologue for authed BFF reads: resolve the browser actor from the session cookie and
 * mint the scoped-token API client for the private hop (ADR-0051). Returns `null` when the
 * session doesn't resolve so loaders can fail closed; the bearer never reaches the browser.
 */
export async function resolveAuthenticatedApiClient(): Promise<{
  readonly api: BffApiClient;
  readonly actor: UserActor;
} | null> {
  const request = getRequest();
  const webEnv = env as WebEnv;
  const resolved = await resolveBrowserActor(request, webEnv);
  if (!resolved.ok) {
    return null;
  }
  // Authed console document: never cache the per-user org metadata it renders (INS-410). Emitting
  // here — the one chokepoint every authed console SSR read passes through — means a new authed
  // route inherits the directive without its own copy. Redirects/logout set their own no-store.
  applyAuthedDocumentCacheHeaders();
  return { api: apiClientFor(webEnv, resolved.actor), actor: resolved.actor };
}
