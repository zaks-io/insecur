import { createServerFn } from "@tanstack/react-start";
import { resolveAuthenticatedApiClient } from "./bff-api.js";

export type WhoamiProof =
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "unavailable" }
  | {
      readonly kind: "authenticated";
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
    kind: "authenticated",
    actorType: readStringField(data, "actorType", "user"),
    userId: readStringField(data, "userId", fallback.userId),
    sessionId: readStringField(data, "sessionId", fallback.sessionId),
  };
}

export const loadWhoamiProof = createServerFn({ method: "GET" }).handler(
  async (): Promise<WhoamiProof> => {
    const client = await resolveAuthenticatedApiClient();
    if (client === null) {
      return { kind: "unauthenticated" };
    }

    let body: unknown;
    try {
      body = await client.api.whoami();
    } catch {
      return { kind: "unavailable" };
    }
    return (
      parseWhoamiProofBody(body, {
        userId: client.actor.userId,
        sessionId: client.actor.sessionId,
      }) ?? { kind: "unavailable" }
    );
  },
);
