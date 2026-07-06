import type { ConsoleEnvelopeParse } from "../console/envelope.js";
import { resolveAuthenticatedApiClient, type BffApiClient } from "./bff-api.js";

/** Sentinel returned from a read callback when the API returned a retryable outage envelope. */
const CONSOLE_READ_UNAVAILABLE_SENTINEL = Symbol("console-read-unavailable");

export type ConsoleReadUnavailableSentinel = typeof CONSOLE_READ_UNAVAILABLE_SENTINEL;

/** Read callback result: `null` is a metadata-safe denial; the outage sentinel retries the shell. */
export type ConsoleReadInnerResult<T> = T | null | ConsoleReadUnavailableSentinel;

export const consoleReadUnavailable: ConsoleReadUnavailableSentinel =
  CONSOLE_READ_UNAVAILABLE_SENTINEL;

export function envelopeParseToReadResult<T>(
  parsed: ConsoleEnvelopeParse<T>,
): ConsoleReadInnerResult<T> {
  if (parsed.kind === "ok") {
    return parsed.value;
  }
  if (parsed.kind === "unavailable") {
    return consoleReadUnavailable;
  }
  return null;
}

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

function isConsoleReadUnavailable<T>(
  value: ConsoleReadInnerResult<T>,
): value is ConsoleReadUnavailableSentinel {
  return value === consoleReadUnavailable;
}

export async function consoleRead<T>(
  read: (api: BffApiClient) => Promise<ConsoleReadInnerResult<T>>,
): Promise<ConsoleRead<T>> {
  const client = await resolveAuthenticatedApiClient();
  if (client === null) {
    return { kind: "unauthenticated" };
  }
  // Fail closed: a transport error or a non-JSON/malformed body (e.g. `response.json()` throwing on
  // a 5xx HTML page) returns `unavailable` when the session resolved, so the shell can retry
  // without a login redirect (INS-415). Structured non-auth API error envelopes also retry;
  // only a resolved actor with a parsed null reaches `denied`.
  let value: ConsoleReadInnerResult<T>;
  try {
    value = await read(client.api);
  } catch {
    return { kind: "unavailable" };
  }
  if (isConsoleReadUnavailable(value)) {
    return { kind: "unavailable" };
  }
  return value === null ? { kind: "denied" } : { kind: "ok", value };
}
