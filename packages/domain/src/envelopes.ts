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

export function successEnvelope<TData>(
  data: TData,
  meta?: MetadataEnvelopeMeta,
): SuccessEnvelope<TData> {
  return meta === undefined ? { ok: true, data } : { ok: true, data, meta };
}

export function errorEnvelope(error: ErrorBody, meta?: MetadataEnvelopeMeta): ErrorEnvelope {
  return meta === undefined ? { ok: false, error } : { ok: false, error, meta };
}

/** Keys that must never appear on metadata envelopes (Sensitive Value guard). */
export const FORBIDDEN_ENVELOPE_KEYS = [
  "value",
  "secret",
  "plaintext",
  "sensitiveValue",
  "token",
  "password",
  "ciphertext",
  "wrappedValue",
  "dek",
] as const;

function assertNoForbiddenKeys(value: Record<string, unknown>): void {
  for (const key of FORBIDDEN_ENVELOPE_KEYS) {
    if (key in value) {
      throw new Error(`envelope contains forbidden key: ${key}`);
    }
  }
}

function assertMetadataSection(value: unknown): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  assertNoForbiddenKeys(value as Record<string, unknown>);
}

export function assertMetadataOnlyEnvelopeShape(value: Record<string, unknown>): void {
  assertNoForbiddenKeys(value);
  if ("data" in value) {
    assertMetadataSection(value.data);
  }
  if ("error" in value) {
    assertMetadataSection(value.error);
  }
  if ("meta" in value) {
    assertMetadataSection(value.meta);
  }
}
