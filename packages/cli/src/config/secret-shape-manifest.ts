import {
  parseDisplayName,
  parseVariableKey,
  type DisplayName,
  type VariableKey,
} from "@insecur/domain";
import { requireNonEmptyString } from "./require-non-empty-string.js";

export interface SecretShapeManifestEntry {
  readonly variableKey: VariableKey;
  readonly displayName?: DisplayName;
  readonly description?: string;
  readonly required?: boolean;
  readonly generationHint?: string;
}

const SECRET_SHAPE_LABEL = "secretShapes";

function parseOptionalDisplayName(value: unknown, context: string): DisplayName | undefined {
  if (value === undefined) {
    return undefined;
  }
  const raw = requireNonEmptyString(value, context);
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`${context} is invalid: ${raw}`);
  }
  return parsed.value;
}

function parseOptionalStringField(value: unknown, context: string): string | undefined {
  return value === undefined ? undefined : requireNonEmptyString(value, context);
}

function parseVariableKeyField(record: Record<string, unknown>, context: string): VariableKey {
  const variableKeyRaw = requireNonEmptyString(record.variableKey, `${context}.variableKey`);
  const parsedVariableKey = parseVariableKey(variableKeyRaw);
  if (!parsedVariableKey.ok) {
    throw new Error(`${context}.variableKey is invalid: ${variableKeyRaw}`);
  }
  return parsedVariableKey.value;
}

function parseSecretShapeEntry(value: unknown, index: number): SecretShapeManifestEntry {
  const context = `${SECRET_SHAPE_LABEL}[${String(index)}]`;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  const record = value as Record<string, unknown>;
  return buildSecretShapeEntry(record, context);
}

function buildSecretShapeEntry(
  record: Record<string, unknown>,
  context: string,
): SecretShapeManifestEntry {
  const variableKey = parseVariableKeyField(record, context);
  const displayName = parseOptionalDisplayName(record.displayName, `${context}.displayName`);
  const description = parseOptionalStringField(record.description, `${context}.description`);
  const required = record.required === undefined ? undefined : record.required === true;
  const generationHint = parseOptionalStringField(
    record.generationHint,
    `${context}.generationHint`,
  );
  return {
    variableKey,
    ...(displayName === undefined ? {} : { displayName }),
    ...(description === undefined ? {} : { description }),
    ...(required === undefined ? {} : { required }),
    ...(generationHint === undefined ? {} : { generationHint }),
  };
}

export function parseSecretShapeManifest(value: unknown): readonly SecretShapeManifestEntry[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${SECRET_SHAPE_LABEL} must be an array`);
  }
  return value.map((entry, index) => parseSecretShapeEntry(entry, index));
}

export function serializeSecretShapeManifest(
  entries: readonly SecretShapeManifestEntry[],
): readonly Record<string, unknown>[] {
  return entries.map((entry) => {
    const payload: Record<string, unknown> = { variableKey: entry.variableKey };
    if (entry.displayName !== undefined) {
      payload.displayName = entry.displayName;
    }
    if (entry.description !== undefined) {
      payload.description = entry.description;
    }
    if (entry.required === true) {
      payload.required = true;
    }
    if (entry.generationHint !== undefined) {
      payload.generationHint = entry.generationHint;
    }
    return payload;
  });
}
