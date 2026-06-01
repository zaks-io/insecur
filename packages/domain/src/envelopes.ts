import type { DisplayName } from "./display-name.js";
import type { KnownErrorCode } from "./error-codes.js";
import type { OpaqueResourceId } from "./opaque-resource-id.js";
import type { OperationId, RequestId } from "./resource-ids.js";

/** Metadata-only target echo for CLI/API output. */
export interface ResolvedTargetEcho {
  type: string;
  id: OpaqueResourceId;
  displayName?: DisplayName;
  slug?: string;
  parent?: ResolvedTargetEcho;
}

/** Shared envelope metadata; must not carry Sensitive Values. */
export interface MetadataEnvelopeMeta {
  requestId?: RequestId;
  operationId?: OperationId;
  resolvedTargets?: readonly ResolvedTargetEcho[];
}

export interface ErrorBody {
  code: KnownErrorCode;
  message: string;
  retryable: boolean;
}

export interface SuccessEnvelope<TData> {
  readonly ok: true;
  readonly data: TData;
  readonly meta?: MetadataEnvelopeMeta;
}

export interface ErrorEnvelope {
  readonly ok: false;
  readonly error: ErrorBody;
  readonly meta?: MetadataEnvelopeMeta;
}

export type MetadataEnvelope<TData> = SuccessEnvelope<TData> | ErrorEnvelope;

/**
 * Keys that must never appear on metadata envelopes (Sensitive Value guard).
 * Includes seam input field names (`valueUtf8`, `plaintextUtf8`) that must not
 * be serialized through CLI/API JSON envelopes.
 */
export const FORBIDDEN_ENVELOPE_KEYS = [
  "value",
  "valueUtf8",
  "secret",
  "plaintext",
  "plaintextUtf8",
  "sensitiveValue",
  "token",
  "password",
  "ciphertext",
  "wrappedValue",
  "dek",
] as const;

const FORBIDDEN_KEY_SET = new Set<string>(FORBIDDEN_ENVELOPE_KEYS);

export class MetadataEnvelopeValidationError extends Error {
  readonly forbiddenKey: string;

  constructor(forbiddenKey: string) {
    super(`envelope contains forbidden key: ${forbiddenKey}`);
    this.name = "MetadataEnvelopeValidationError";
    this.forbiddenKey = forbiddenKey;
  }
}

function assertNoForbiddenKeys(record: Record<string, unknown>): void {
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_KEY_SET.has(key)) {
      throw new MetadataEnvelopeValidationError(key);
    }
  }
}

function visitMetadataContainer(value: Record<string, unknown>): void {
  assertNoForbiddenKeys(value);
  for (const child of Object.values(value)) {
    assertMetadataOnlyValue(child);
  }
}

/**
 * Recursively rejects plain objects and arrays that carry forbidden Sensitive
 * Value key names anywhere in the tree.
 */
export function assertMetadataOnlyValue(value: unknown): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      assertMetadataOnlyValue(item);
    }
    return;
  }
  visitMetadataContainer(value as Record<string, unknown>);
}

export function assertMetadataOnlyEnvelopeShape(value: Record<string, unknown>): void {
  assertMetadataOnlyValue(value);
}

export function successEnvelope<TData>(
  data: TData,
  meta?: MetadataEnvelopeMeta,
): SuccessEnvelope<TData> {
  assertMetadataOnlyValue(data);
  if (meta !== undefined) {
    assertMetadataOnlyValue(meta);
  }
  return meta === undefined ? { ok: true, data } : { ok: true, data, meta };
}

export function errorEnvelope(error: ErrorBody, meta?: MetadataEnvelopeMeta): ErrorEnvelope {
  assertMetadataOnlyValue(error);
  if (meta !== undefined) {
    assertMetadataOnlyValue(meta);
  }
  return meta === undefined ? { ok: false, error } : { ok: false, error, meta };
}
