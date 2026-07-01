import { OPAQUE_RESOURCE_ID_PATTERN } from "./opaque-resource-id.js";
import { isStableDottedCode } from "./stable-dotted-code.js";

/**
 * Metadata-only detail/progress string values must be structurally constrained so
 * Sensitive Values cannot be smuggled as arbitrary prose (spec §11, ADR-0068).
 *
 * Approach: value-type guard — strings are limited to stable dotted codes or opaque
 * resource IDs; numbers and booleans are accepted as-is. Field-specific exceptions
 * (ISO-8601 timestamps, provider target selectors, idempotency keys) are validated
 * at their owning call sites, not through this helper.
 */
export type MetadataSafeStringKind = "stable_dotted_code" | "opaque_resource_id";

export function isOpaqueResourceIdString(value: string): boolean {
  return OPAQUE_RESOURCE_ID_PATTERN.test(value);
}

export function classifyMetadataSafeString(value: string): MetadataSafeStringKind | null {
  if (isStableDottedCode(value)) {
    return "stable_dotted_code";
  }
  if (isOpaqueResourceIdString(value)) {
    return "opaque_resource_id";
  }
  return null;
}

export function isMetadataSafeStringValue(value: string): boolean {
  return classifyMetadataSafeString(value) !== null;
}

export function isMetadataSafeDetailPrimitive(
  value: unknown,
): value is string | number | boolean | null {
  if (value === null || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "string") {
    return isMetadataSafeStringValue(value);
  }
  return false;
}

export function assertMetadataSafeDetailValue(value: unknown, field = "detail value"): void {
  if (isMetadataSafeDetailPrimitive(value)) {
    return;
  }
  if (typeof value === "string") {
    throw new Error(
      `${field} must be a stable dotted code or opaque resource ID, not free-form text`,
    );
  }
  throw new Error(`${field} must be a stable dotted code, opaque ID, number, boolean, or null`);
}

export function assertMetadataSafeDetailMap(
  details: Readonly<Record<string, unknown>>,
  mapName = "details",
): void {
  for (const [key, value] of Object.entries(details)) {
    assertMetadataSafeDetailValue(value, `${mapName}.${key}`);
  }
}
