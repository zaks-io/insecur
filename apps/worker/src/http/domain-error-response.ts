import { DecryptError, RootKeyNotConfiguredError } from "@insecur/crypto";
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

function messageForError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Request failed.";
}

function retryableForError(error: unknown): boolean {
  if (
    error instanceof SecretWriteError ||
    error instanceof InjectionGrantError ||
    error instanceof DecryptError ||
    error instanceof RootKeyNotConfiguredError
  ) {
    return error.retryable;
  }
  return false;
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

export function knownErrorCodeFromUnknown(error: unknown): KnownErrorCode {
  if (error instanceof SecretWriteError) {
    return error.code;
  }
  if (error instanceof InjectionGrantError) {
    return error.code;
  }
  if (error instanceof DecryptError || error instanceof RootKeyNotConfiguredError) {
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
