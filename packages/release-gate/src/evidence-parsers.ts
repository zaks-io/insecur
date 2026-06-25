type UnknownRecord = Record<string, unknown>;

export function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as UnknownRecord;
}

export function readString(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

export function readNumber(record: UnknownRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" ? value : null;
}

export function hasOneOf<T extends string>(
  record: UnknownRecord,
  key: string,
  allowed: readonly T[],
): T | null {
  const value = record[key];
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}
