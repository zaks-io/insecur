/** Drizzle's postgres-js driver uses transparent timestamp parsers (OID 1184, etc.). */
export function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
