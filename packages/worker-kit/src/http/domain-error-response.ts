import {
  STORE_ERROR_CODES,
  VALIDATION_ERROR_CODES,
  isKnownErrorCodeInCatalog,
  type KnownErrorCode,
  errorEnvelope,
  type ErrorEnvelope,
  type RequestId,
} from "@insecur/domain";
import { GuidedOrganizationProvisionError } from "@insecur/onboarding";
import { InjectionGrantError } from "@insecur/runtime-injection";
import { SecretWriteError } from "@insecur/secret-store";
import { RuntimeConfigMissingError } from "@insecur/tenant-store";
import { HTTP_STATUS_BY_CODE } from "./http-status-by-code.js";

// The public edge (API/Web) never imports @insecur/crypto (ADR-0064/0077): crypto and
// decrypt run only behind the Runtime Worker RPC seam. A crypto failure (DecryptError,
// RootKeyNotConfiguredError) therefore reaches this handler as a structurally-typed
// { code, retryable } value across the seam, not as a live class instance — so the
// error code and retryability are read structurally below, and the crypto-code → HTTP
// status mapping lives in HTTP_STATUS_BY_CODE via @insecur/domain (no crypto import).

function messageForError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Request failed.";
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
  if (error instanceof SecretWriteError || error instanceof InjectionGrantError) {
    return error.retryable;
  }
  return readRetryable(error);
}

export function knownErrorCodeFromUnknown(error: unknown): KnownErrorCode {
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
  return readErrorCode(error) ?? VALIDATION_ERROR_CODES.invalidOpaqueResourceId;
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
      message: messageForError(error),
      retryable: retryableForError(error),
    },
    { requestId },
  );
  return { status, body };
}

export { HTTP_STATUS_BY_CODE };
