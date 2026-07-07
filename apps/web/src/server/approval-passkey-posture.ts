import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import {
  authenticateWorkOSSession,
  hasApprovalPasskey,
  parseRequestCredentials,
} from "@insecur/auth";
import { createWorkOSSessionPortFromEnv } from "../auth/workos-port.js";
import type { WebEnv } from "../env.js";

export type ApprovalPasskeyPosture =
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "authenticated"; readonly enrolled: boolean };

/**
 * Server-side read of whether the signed-in member has an approval passkey enrolled. Metadata
 * only: WorkOS auth factor types and authentication method, never credential material (ADR-0052).
 */
export const loadApprovalPasskeyPosture = createServerFn({ method: "GET" }).handler(
  async (): Promise<ApprovalPasskeyPosture> => {
    try {
      const request = getRequest();
      const credentials = parseRequestCredentials({
        authorizationHeader: request.headers.get("Authorization"),
        cookieHeader: request.headers.get("Cookie"),
        csrfHeader: request.headers.get("x-insecur-csrf") ?? undefined,
      });
      if (credentials.workosSealedSession === undefined) {
        return { kind: "unauthenticated" };
      }

      const workos = createWorkOSSessionPortFromEnv(env as WebEnv);
      const session = await authenticateWorkOSSession(workos, credentials.workosSealedSession);
      if (!session.ok) {
        return { kind: "unauthenticated" };
      }

      const registeredPasskey = await workos.userHasRegisteredPasskey(session.context.user.id);

      return {
        kind: "authenticated",
        enrolled: hasApprovalPasskey({
          ...(session.context.authenticationMethod !== undefined
            ? { authenticationMethod: session.context.authenticationMethod }
            : {}),
          registeredPasskey,
        }),
      };
    } catch {
      return { kind: "unauthenticated" };
    }
  },
);
