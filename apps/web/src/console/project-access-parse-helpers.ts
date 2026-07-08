const AUTH_METHOD_STATUSES = new Set(["active", "disabled"]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseOptionalStringField(
  entry: Record<string, unknown>,
  field: string,
): string | undefined | null {
  const value = entry[field];
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" ? value : null;
}

export function parseOptionalNullableStringField(
  entry: Record<string, unknown>,
  field: string,
): string | null | undefined {
  const value = entry[field];
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? value : null;
}

export function parseOptionalNumberField(
  entry: Record<string, unknown>,
  field: string,
): number | null | undefined {
  const value = entry[field];
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return typeof value === "number" ? value : null;
}

export function isAuthMethodStatus(value: string): value is "active" | "disabled" {
  return AUTH_METHOD_STATUSES.has(value);
}
