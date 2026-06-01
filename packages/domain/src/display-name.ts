import { type Brand, brandValue } from "./brand.js";

/** User-authored product label on the Plaintext Metadata Allowlist. */
export type DisplayName = Brand<string, "DisplayName">;

export const DISPLAY_NAME_MAX_LENGTH = 200;

function hasControlCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if ((code >= 0x00 && code <= 0x1f) || code === 0x7f) {
      return true;
    }
  }
  return false;
}

export type ParseDisplayNameResult =
  | { ok: true; value: DisplayName }
  | {
      ok: false;
      code: "validation.invalid_display_name" | "validation.display_name_empty";
    };

export function parseDisplayName(raw: string): ParseDisplayNameResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, code: "validation.display_name_empty" };
  }
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, code: "validation.invalid_display_name" };
  }
  if (hasControlCharacters(trimmed)) {
    return { ok: false, code: "validation.invalid_display_name" };
  }
  return { ok: true, value: brandValue<string, "DisplayName">(trimmed) };
}
