import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import type { UserActor } from "@insecur/auth";
import { apiClientFor } from "@insecur/worker-kit/api-client";
import { resolveBrowserActor } from "../auth/resolve-browser-actor.js";
import { asWebEnv } from "../env.js";

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
  const webEnv = asWebEnv(env);
  const resolved = await resolveBrowserActor(request, webEnv);
  if (!resolved.ok) {
    return null;
  }
  // The authed-document no-store cache directive (INS-410) is stamped in resolveBrowserActor's
  // finalize path, so any successful actor resolution carries it, not just this BFF chokepoint.
  return { api: apiClientFor(webEnv, resolved.actor), actor: resolved.actor };
}
