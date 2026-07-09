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

/**
 * Metadata-only next-step instructions for actionable CLI/API errors.
 *
 * The command fields (`login`, `init`, `usage`, …) are argv token arrays so a
 * caller — human or agent — can run the recovery directly without parsing prose.
 * Tokens wrapped in angle brackets (for example `<variable-key>`) are
 * placeholders the caller must substitute before running the command.
 * `type` and `suggestedFix` follow RFC 9457 Problem Details: a stable per-code
 * error-type URI for machine dispatch, and a one-line plain-language fix.
 */
export interface ErrorRemediation {
  readonly approvalUrl?: string;
  readonly login?: readonly string[];
  readonly init?: readonly string[];
  readonly migrate?: readonly string[];
  readonly poll?: readonly string[];
  readonly resume?: readonly string[];
  readonly hosted?: readonly string[];
  readonly secretsSet?: readonly string[];
  readonly type?: string;
  readonly suggestedFix?: string;
  readonly usage?: readonly string[];
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
  readonly remediation?: ErrorRemediation;
}

export interface ErrorEnvelopeOptions {
  readonly meta?: MetadataEnvelopeMeta;
  readonly remediation?: ErrorRemediation;
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

export type MetadataEnvelopeValidationReason =
  "forbidden_key" | "binary_payload" | "unsupported_value";

const FORBIDDEN_KEY_SET = new Set<string>(FORBIDDEN_ENVELOPE_KEYS);

export class MetadataEnvelopeValidationError extends Error {
  readonly reason: MetadataEnvelopeValidationReason;
  readonly forbiddenKey?: string | undefined;

  constructor(reason: MetadataEnvelopeValidationReason, message: string, forbiddenKey?: string) {
    super(message);
    this.name = "MetadataEnvelopeValidationError";
    this.reason = reason;
    if (forbiddenKey !== undefined) {
      this.forbiddenKey = forbiddenKey;
    }
  }

  static forbiddenKey(key: string): MetadataEnvelopeValidationError {
    return new MetadataEnvelopeValidationError(
      "forbidden_key",
      `envelope contains forbidden key: ${key}`,
      key,
    );
  }

  static binaryPayload(): MetadataEnvelopeValidationError {
    return new MetadataEnvelopeValidationError(
      "binary_payload",
      "envelope contains forbidden binary payload",
    );
  }

  static unsupportedValue(description: string): MetadataEnvelopeValidationError {
    return new MetadataEnvelopeValidationError(
      "unsupported_value",
      `envelope contains unsupported value: ${description}`,
    );
  }
}

function isNodeBuffer(value: unknown): boolean {
  return typeof Buffer !== "undefined" && Buffer.isBuffer(value);
}

export function isBinaryPayload(value: unknown): boolean {
  if (value instanceof ArrayBuffer) {
    return true;
  }
  if (ArrayBuffer.isView(value)) {
    return true;
  }
  return isNodeBuffer(value);
}

function isPlainMetadataObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

function assertFiniteNumber(value: number): void {
  if (!Number.isFinite(value)) {
    throw MetadataEnvelopeValidationError.unsupportedValue("non-finite number");
  }
}

function assertJsonSafeNonObjectPrimitive(value: unknown): void {
  const valueType = typeof value;
  if (valueType === "string" || valueType === "boolean") {
    return;
  }
  if (valueType === "number") {
    assertFiniteNumber(value as number);
    return;
  }
  if (valueType === "undefined") {
    throw MetadataEnvelopeValidationError.unsupportedValue("undefined");
  }
  if (valueType === "bigint") {
    throw MetadataEnvelopeValidationError.unsupportedValue("bigint");
  }
  if (valueType === "symbol") {
    throw MetadataEnvelopeValidationError.unsupportedValue("symbol");
  }
  if (valueType === "function") {
    throw MetadataEnvelopeValidationError.unsupportedValue("function");
  }
}

function assertJsonSafePrimitive(value: unknown): void {
  if (isBinaryPayload(value)) {
    throw MetadataEnvelopeValidationError.binaryPayload();
  }
  assertJsonSafeNonObjectPrimitive(value);
}

function assertNoForbiddenKeys(record: Record<string, unknown>): void {
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_KEY_SET.has(key)) {
      throw MetadataEnvelopeValidationError.forbiddenKey(key);
    }
  }
}

function visitMetadataContainer(value: Record<string, unknown>): void {
  assertNoForbiddenKeys(value);
  for (const child of Object.values(value)) {
    assertMetadataOnlyValue(child);
  }
}

function assertMetadataOnlyObject(value: object): void {
  if (isBinaryPayload(value)) {
    throw MetadataEnvelopeValidationError.binaryPayload();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      assertMetadataOnlyValue(item);
    }
    return;
  }

  if (!isPlainMetadataObject(value)) {
    throw MetadataEnvelopeValidationError.unsupportedValue("non-plain object");
  }

  visitMetadataContainer(value as Record<string, unknown>);
}

/**
 * Recursively rejects forbidden Sensitive Value keys, binary payloads, and
 * non-JSON-safe values. Metadata envelopes may contain only JSON-safe primitives,
 * arrays, and plain objects.
 *
 * Audit `details` and operation `progress` maps use the narrower value-type guard
 * in `metadata-safe-value.ts` (stable dotted codes, opaque IDs, numbers, booleans).
 */
export function assertMetadataOnlyValue(value: unknown): void {
  if (value === null) {
    return;
  }

  const valueType = typeof value;
  if (valueType !== "object") {
    assertJsonSafePrimitive(value);
    return;
  }

  assertMetadataOnlyObject(value as object);
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

export function errorEnvelope(error: ErrorBody, options?: ErrorEnvelopeOptions): ErrorEnvelope {
  assertMetadataOnlyValue(error);
  if (options?.meta !== undefined) {
    assertMetadataOnlyValue(options.meta);
  }
  if (options?.remediation !== undefined) {
    assertMetadataOnlyValue(options.remediation);
  }
  if (options === undefined) {
    return { ok: false, error };
  }
  return {
    ok: false,
    error,
    ...(options.meta !== undefined ? { meta: options.meta } : {}),
    ...(options.remediation !== undefined ? { remediation: options.remediation } : {}),
  };
}
