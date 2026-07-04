import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { apiClientFor } from "@insecur/worker-kit/api-client";
import { resolveBrowserActor } from "../auth/resolve-browser-actor.js";
import { applyBrowserSessionRotation } from "../auth/session-headers.js";
import type { WebEnv } from "../env.js";

export type WhoamiProof =
  | { readonly authenticated: false }
  | {
      readonly authenticated: true;
      readonly actorType: string;
      readonly userId: string;
      readonly sessionId: string;
    };

function readStringField(data: Record<string, unknown>, key: string, fallback: string): string {
  const value = data[key];
  return typeof value === "string" ? value : fallback;
}

function parseWhoamiProofBody(
  body: unknown,
  fallback: { readonly userId: string; readonly sessionId: string },
): WhoamiProof | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const envelope = body as Record<string, unknown>;
  if (envelope.ok !== true || typeof envelope.data !== "object" || envelope.data === null) {
    return null;
  }

  const data = envelope.data as Record<string, unknown>;
  return {
    authenticated: true,
    actorType: readStringField(data, "actorType", "user"),
    userId: readStringField(data, "userId", fallback.userId),
    sessionId: readStringField(data, "sessionId", fallback.sessionId),
  };
}

export const loadWhoamiProof = createServerFn({ method: "GET" }).handler(
  async (): Promise<WhoamiProof> => {
    const request = getRequest();
    const webEnv = env as WebEnv;
    const resolved = await resolveBrowserActor(request, webEnv);
    if (!resolved.ok) {
      return { authenticated: false };
    }
    if (resolved.rotation !== undefined) {
      applyBrowserSessionRotation(resolved.rotation);
    }

    const api = apiClientFor(webEnv, resolved.actor);
    const body: unknown = await api.whoami();
    return (
      parseWhoamiProofBody(body, {
        userId: resolved.actor.userId,
        sessionId: resolved.actor.sessionId,
      }) ?? { authenticated: false }
    );
  },
);
