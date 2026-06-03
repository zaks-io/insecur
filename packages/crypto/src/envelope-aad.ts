const FIELD_SEPARATOR = "\u001f";

/** Canonical AAD bytes from ordered string fields (ADR-0026). */
export function serializeAadFields(parts: readonly string[]): Uint8Array {
  return new TextEncoder().encode(parts.join(FIELD_SEPARATOR));
}

export { FIELD_SEPARATOR };
