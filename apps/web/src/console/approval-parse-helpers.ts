export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function requiredStringField(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

export function requiredBooleanField(row: Record<string, unknown>, key: string): boolean | null {
  const value = row[key];
  return typeof value === "boolean" ? value : null;
}

export function requiredNumberField(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  return typeof value === "number" ? value : null;
}

export function optionalStringField(
  row: Record<string, unknown>,
  key: string,
): { readonly ok: true; readonly value: string | null } | { readonly ok: false } {
  const value = row[key];
  if (value === undefined) {
    return { ok: true, value: null };
  }
  if (typeof value === "string") {
    return { ok: true, value };
  }
  return { ok: false };
}

export function optionalNumberField(
  row: Record<string, unknown>,
  key: string,
): { readonly ok: true; readonly value: number | null } | { readonly ok: false } {
  const value = row[key];
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (typeof value === "number") {
    return { ok: true, value };
  }
  return { ok: false };
}

export function optionalNullableStringField(
  row: Record<string, unknown>,
  key: string,
): { readonly ok: true; readonly value: string | null } | { readonly ok: false } {
  const value = row[key];
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (typeof value === "string") {
    return { ok: true, value };
  }
  return { ok: false };
}
