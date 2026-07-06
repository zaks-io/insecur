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
