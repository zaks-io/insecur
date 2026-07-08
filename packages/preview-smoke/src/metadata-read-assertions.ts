import { assertMetadataOnlyEnvelopeShape } from "@insecur/domain";

import { assertEqual, asRecord, requireString, type JsonRecord } from "./http.js";

export function assertMetadataReadEnvelope(body: JsonRecord, label: string): JsonRecord {
  assertMetadataOnlyEnvelopeShape(body);
  assertEqual(body.ok, true, `${label} ok`);
  return asRecord(body.data, `${label} data`);
}

export function assertResponseFreeOfRedactedPatterns(
  redactor: (value: unknown) => string,
  value: unknown,
  label: string,
): void {
  if (redactor(value).includes("[redacted]")) {
    throw new Error(`${label} leaked a sensitive value.`);
  }
}

export function requireObjectArray(value: unknown, label: string): JsonRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((item, index) => asRecord(item, `${label}[${String(index)}]`));
}

export function findById(
  rows: readonly JsonRecord[],
  idKey: string,
  expectedId: string,
  label: string,
): JsonRecord {
  const match = rows.find((row) => row[idKey] === expectedId);
  if (match === undefined) {
    throw new Error(`${label} did not include ${idKey} ${expectedId}.`);
  }
  return match;
}

export function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

export function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

export function requireNullableString(value: unknown, label: string): string | null {
  if (value === null) {
    return null;
  }
  return requireString(value, label);
}
