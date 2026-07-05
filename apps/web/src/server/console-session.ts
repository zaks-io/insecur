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
 */
export const loadConsoleSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<ConsoleSession> => {
    const client = await resolveAuthenticatedApiClient();
    if (client === null) {
      return { authenticated: false };
    }

    const body: unknown = await client.api.sessionMemberships();
    const organizations = parseSessionMembershipsBody(body);
    if (organizations === null) {
      return { authenticated: false };
    }
    return { authenticated: true, organizations };
  },
);
