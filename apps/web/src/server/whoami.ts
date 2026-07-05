import { createServerFn } from "@tanstack/react-start";
import { resolveAuthenticatedApiClient } from "./bff-api.js";

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
    const client = await resolveAuthenticatedApiClient();
    if (client === null) {
      return { authenticated: false };
    }

    const body: unknown = await client.api.whoami();
    return (
      parseWhoamiProofBody(body, {
        userId: client.actor.userId,
        sessionId: client.actor.sessionId,
      }) ?? { authenticated: false }
    );
  },
);
