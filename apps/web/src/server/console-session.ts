import { createServerFn } from "@tanstack/react-start";
import { parseSessionMembershipsBody, type ConsoleOrganization } from "../console/organizations.js";
import { resolveAuthenticatedApiClient } from "./bff-api.js";

export type ConsoleSession =
  | { readonly authenticated: false }
  | {
      readonly authenticated: true;
      readonly organizations: readonly ConsoleOrganization[];
    };

/**
 * The console shell's session read: resolve the browser actor from the session cookie, then fetch
 * the memberships read over the BFF's scoped-token hop (ADR-0051). The bearer for the API hop is
 * minted server-side and never reaches the browser; the loader receives metadata only. An
 * unparseable envelope fails closed to unauthenticated rather than rendering a broken console.
 *
 * Kept inline in the handler on purpose: the server-fn compiler strips this body from the client
 * bundle, so the `bff-api` -> `cloudflare:workers` import never leaks client-side. Do not extract
 * it into a named export.
 */
export const loadConsoleSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<ConsoleSession> => {
    const client = await resolveAuthenticatedApiClient();
    if (client === null) {
      return { authenticated: false };
    }

    // Fail closed on the read itself, not only on the parse: a transport error or a non-JSON 5xx
    // body (`sessionMemberships()` throwing) must land on the same unauthenticated fallback the
    // console shell already renders, never an unhandled 500 loader error. Mirrors the shared
    // consoleRead helper's guard (INS-412 item 6); this loader is the one read that predates it.
    let body: unknown;
    try {
      body = await client.api.sessionMemberships();
    } catch {
      return { authenticated: false };
    }
    const organizations = parseSessionMembershipsBody(body);
    if (organizations === null) {
      return { authenticated: false };
    }
    return { authenticated: true, organizations };
  },
);
