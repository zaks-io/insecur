import {
  ABUSE_ERROR_CODES,
  AUTH_ERROR_CODES,
  CRYPTO_ERROR_CODES,
  STORE_ERROR_CODES,
  VALIDATION_ERROR_CODES,
  isKnownErrorCodeInCatalog,
  type KnownErrorCode,
  errorEnvelope,
  type ErrorEnvelope,
  type RequestId,
} from "@insecur/domain";
import { GuidedOrganizationProvisionError } from "@insecur/onboarding";
import { OperationStoreError } from "@insecur/operations";
import { InjectionGrantError } from "@insecur/runtime-injection-issue";
import { SecretWriteError } from "@insecur/secret-store-contracts";
import { RuntimeConfigMissingError } from "@insecur/tenant-store";
import { AbuseLimitError } from "../abuse/abuse-limit-error.js";
import { HTTP_STATUS_BY_CODE } from "./http-status-by-code.js";

// The public edge (API/Web) never imports @insecur/crypto (ADR-0064/0077): crypto and
// decrypt run only behind the Runtime Worker RPC seam. A crypto failure (DecryptError,
// RootKeyNotConfiguredError) therefore reaches this handler as a structurally-typed
// { code, retryable } value across the seam, not as a live class instance — so the
// error code and retryability are read structurally below, and the crypto-code → HTTP
// status mapping lives in HTTP_STATUS_BY_CODE via @insecur/domain (no crypto import).

const GENERIC_ERROR_MESSAGE = "Request failed." as const;

/** Error classes whose constructor always sets the same message. */
const STATIC_MESSAGE_BY_ERROR_NAME: Readonly<Record<string, string>> = {
  RuntimeConfigMissingError: "runtime database configuration is required",
  RuntimeTokenSigningSecretConfigError:
    "runtime configuration invalid: runtimeTokenSigningSecret must be a non-empty value of at least 32 characters",
  DecryptError: "decrypt failed",
  RootKeyNotConfiguredError: "instance root key is not configured",
  TenantDataKeyNotReadyError: "tenant data keys are not ready",
  InvalidAadFieldError: "invalid aad field",
};

/** KnownErrorCode values with fixed HTTP-facing copy (including seam-crossed crypto codes). */
const STATIC_MESSAGE_BY_CODE: Readonly<Partial<Record<KnownErrorCode, string>>> = {
  [CRYPTO_ERROR_CODES.decryptFailed]: "decrypt failed",
  [CRYPTO_ERROR_CODES.rootKeyNotConfigured]: "instance root key is not configured",
  [CRYPTO_ERROR_CODES.tenantDataKeyNotReady]: "tenant data keys are not ready",
  [CRYPTO_ERROR_CODES.invalidAadField]: "invalid aad field",
  [STORE_ERROR_CODES.runtimeConfigMissing]: "runtime database configuration is required",
};

const RUNTIME_TOKEN_SIGNING_SECRET_CONFIG_MESSAGE =
  STATIC_MESSAGE_BY_ERROR_NAME.RuntimeTokenSigningSecretConfigError;

function allowlistedStaticMessage(error: Error, code: KnownErrorCode): string | undefined {
  const expectedByName = STATIC_MESSAGE_BY_ERROR_NAME[error.name];
  if (expectedByName !== undefined && error.message === expectedByName) {
    return expectedByName;
  }
  if (
    code === AUTH_ERROR_CODES.configInvalid &&
    error.message === RUNTIME_TOKEN_SIGNING_SECRET_CONFIG_MESSAGE
  ) {
    return RUNTIME_TOKEN_SIGNING_SECRET_CONFIG_MESSAGE;
  }
  return undefined;
}

export function safePublicErrorMessage(
  error: unknown,
  code: KnownErrorCode,
  options?: { readonly genericMessage?: string },
): string {
  const genericMessage = options?.genericMessage ?? GENERIC_ERROR_MESSAGE;

  if (error instanceof RuntimeConfigMissingError) {
    return STATIC_MESSAGE_BY_ERROR_NAME.RuntimeConfigMissingError ?? genericMessage;
  }

  if (error instanceof Error) {
    const allowlisted = allowlistedStaticMessage(error, code);
    if (allowlisted !== undefined) {
      return allowlisted;
    }
  }

  const codeMessage = STATIC_MESSAGE_BY_CODE[code];
  if (codeMessage !== undefined) {
    return codeMessage;
  }

  return genericMessage;
}

function readErrorCode(error: unknown): KnownErrorCode | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

function readRetryable(error: unknown): boolean {
  if (
    typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    typeof error.retryable === "boolean"
  ) {
    return error.retryable;
  }
  return false;
}

function retryableForError(error: unknown): boolean {
  if (error instanceof AbuseLimitError) {
    return error.retryable;
  }
  if (
    error instanceof SecretWriteError ||
    error instanceof InjectionGrantError ||
    error instanceof OperationStoreError
  ) {
    return error.retryable;
  }
  return readRetryable(error);
}

function errorCodeFromClassInstance(error: unknown): KnownErrorCode | undefined {
  if (error instanceof AbuseLimitError) {
    return ABUSE_ERROR_CODES.rateLimited;
  }
  if (error instanceof SecretWriteError) {
    return error.code;
  }
  if (error instanceof InjectionGrantError) {
    return error.code;
  }
  if (error instanceof GuidedOrganizationProvisionError) {
    return error.code;
  }
  if (error instanceof RuntimeConfigMissingError) {
    return STORE_ERROR_CODES.runtimeConfigMissing;
  }
  if (error instanceof Error && error.name === "TenantDataKeyNotReadyError") {
    return CRYPTO_ERROR_CODES.tenantDataKeyNotReady;
  }
  return undefined;
}

export function knownErrorCodeFromUnknown(error: unknown): KnownErrorCode {
  return (
    errorCodeFromClassInstance(error) ??
    readErrorCode(error) ??
    VALIDATION_ERROR_CODES.invalidOpaqueResourceId
  );
}

export function httpStatusForKnownErrorCode(code: KnownErrorCode): number {
  const mapped = HTTP_STATUS_BY_CODE.get(code);
  if (mapped !== undefined) {
    return mapped;
  }
  if (isKnownErrorCodeInCatalog(code)) {
    throw new Error(
      `Known error code "${code}" is client-side-only or missing an HTTP status registry row.`,
    );
  }
  return 500;
}

export function domainErrorEnvelope(
  error: unknown,
  requestId: RequestId,
): { status: number; body: ErrorEnvelope } {
  const code = knownErrorCodeFromUnknown(error);
  const status = httpStatusForKnownErrorCode(code);
  const body = errorEnvelope(
    {
      code,
      message: safePublicErrorMessage(error, code),
      retryable: retryableForError(error),
    },
    { requestId },
  );
  return { status, body };
}

export { GENERIC_ERROR_MESSAGE, HTTP_STATUS_BY_CODE };
