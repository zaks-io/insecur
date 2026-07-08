import { isStableDottedCode } from "@insecur/domain";

import { KNOWN_HARNESS_MARKERS } from "./harness-markers.js";

const KNOWN_HARNESS_CODES = new Set(
  Object.values(KNOWN_HARNESS_MARKERS).map((marker) => marker.harnessCode),
);

export function isKnownHarnessCode(value: string): boolean {
  return KNOWN_HARNESS_CODES.has(value.trim());
}

/**
 * Derive-time harness names are baked into the signed agent credential and must be trustworthy.
 * Accept only registered harness codes that satisfy the stable dotted-code shape.
 */
export function parseDeriveHarnessName(
  value: string | undefined,
): { readonly ok: true; readonly harnessName: string } | { readonly ok: false } {
  if (value === undefined) {
    return { ok: false };
  }
  const trimmed = value.trim();
  if (trimmed === "" || !isStableDottedCode(trimmed) || !isKnownHarnessCode(trimmed)) {
    return { ok: false };
  }
  return { ok: true, harnessName: trimmed };
}
