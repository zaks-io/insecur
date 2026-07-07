/** Read the stable `error.code` from an API envelope, or `null` when the body is not an error. */
export function readApiErrorCode(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const envelope = body as Record<string, unknown>;
  if (envelope.ok !== false) {
    return null;
  }
  const error = envelope.error;
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" ? code : null;
}

/** True when the API returned an authentication failure the console should treat as logged-out. */
export function isAuthErrorEnvelope(body: unknown): boolean {
  const code = readApiErrorCode(body);
  return code?.startsWith("auth.") ?? false;
}

/** Classified outcome of parsing one API envelope for an authed console metadata read. */
export type ConsoleEnvelopeParse<T> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "denied" }
  | { readonly kind: "unavailable" };

/**
 * Parse a console metadata envelope: success values pass through, `auth.*` errors stay denied,
 * and other structured API failures become unavailable so the shell can retry (INS-415).
 */
export function parseConsoleReadEnvelope<T>(
  body: unknown,
  parse: (body: unknown) => T | null,
): ConsoleEnvelopeParse<T> {
  const value = parse(body);
  if (value !== null) {
    return { kind: "ok", value };
  }
  const code = readApiErrorCode(body);
  if (code === null) {
    return { kind: "denied" };
  }
  return isAuthErrorEnvelope(body) ? { kind: "denied" } : { kind: "unavailable" };
}

/**
 * Extract one `data` field from a `{ ok: true, data: { ... } }` API success envelope. Returns
 * `undefined` for anything else (error envelopes, malformed bodies) so callers fail closed; the
 * console never distinguishes a denial from nonexistence (metadata-safe by construction).
 */
function successEnvelopeField(body: unknown, field: string): unknown {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const envelope = body as Record<string, unknown>;
  if (envelope.ok !== true || typeof envelope.data !== "object" || envelope.data === null) {
    return undefined;
  }
  return (envelope.data as Record<string, unknown>)[field];
}

/**
 * Parse every entry of an envelope list field with `parseEntry`, failing closed: a missing list or
 * any unparseable entry returns `null` rather than a partial result.
 */
export function parseSuccessEnvelopeList<T>(
  body: unknown,
  field: string,
  parseEntry: (entry: unknown) => T | null,
): readonly T[] | null {
  const entries = successEnvelopeField(body, field);
  if (!Array.isArray(entries)) {
    return null;
  }
  const parsed = entries.map(parseEntry);
  return parsed.every((entry): entry is T => entry !== null) ? parsed : null;
}
