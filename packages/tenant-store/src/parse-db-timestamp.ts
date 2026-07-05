/** Drizzle's postgres-js driver uses transparent timestamp parsers (OID 1184, etc.). */
export function parseDbTimestamp(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function toIsoTimestamp(value: Date | string): string {
  return parseDbTimestamp(value).toISOString();
}

export function toEpochSeconds(value: Date | string): number {
  return Math.floor(parseDbTimestamp(value).getTime() / 1000);
}
