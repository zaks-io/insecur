import { InvalidAadFieldError } from "./errors.js";

const FIELD_SEPARATOR = "\u001f";

function assertSeparatorSafeField(value: string): void {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if ((code >= 0x00 && code <= 0x1f) || code === 0x7f) {
      throw new InvalidAadFieldError("aad_field");
    }
  }
}

/** Canonical AAD bytes from ordered string fields (ADR-0026). */
export function serializeAadFields(parts: readonly string[]): Uint8Array {
  for (const part of parts) {
    assertSeparatorSafeField(part);
  }
  return new TextEncoder().encode(parts.join(FIELD_SEPARATOR));
}

export { FIELD_SEPARATOR };
