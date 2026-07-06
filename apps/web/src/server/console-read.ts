import { resolveAuthenticatedApiClient, type BffApiClient } from "./bff-api.js";

/**
 * Authed console metadata read: `unauthenticated` sends the visitor to login, `denied` collapses
 * every failure (non-member, nonexistent, malformed envelope) into one metadata-safe not-found,
 * and `ok` carries metadata only. The bearer for the API hop never reaches the browser.
 */
export type ConsoleRead<T> =
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "denied" }
  | { readonly kind: "ok"; readonly value: T };

export function requiredId(value: unknown, name: string): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

/** Server-fn validator for the org-scoped reads: exactly one required organizationId input. */
export function orgIdInput(input: unknown): { organizationId: string } {
  const { organizationId } = (input ?? {}) as Record<string, unknown>;
  return { organizationId: requiredId(organizationId, "organizationId") };
}

export async function consoleRead<T>(
  read: (api: BffApiClient) => Promise<T | null>,
): Promise<ConsoleRead<T>> {
  const client = await resolveAuthenticatedApiClient();
  if (client === null) {
    return { kind: "unauthenticated" };
  }
  // Fail closed: a transport error or a non-JSON/malformed body (e.g. `response.json()` throwing on
  // a 5xx HTML page) returns `unavailable` when the session resolved, so the shell can retry
  // without a login redirect (INS-415). Only a resolved actor with a parsed null reaches `denied`.
  let value: T | null;
  try {
    value = await read(client.api);
  } catch {
    return { kind: "unavailable" };
  }
  return value === null ? { kind: "denied" } : { kind: "ok", value };
}
