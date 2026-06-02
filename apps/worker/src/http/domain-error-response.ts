import {
  AUTH_ERROR_CODES,
  INJECTION_ERROR_CODES,
  ONBOARDING_ERROR_CODES,
  SECRET_ERROR_CODES,
  STORE_ERROR_CODES,
  VALIDATION_ERROR_CODES,
  type KnownErrorCode,
  errorEnvelope,
  type ErrorEnvelope,
  type RequestId,
} from "@insecur/domain";
import { GuidedOrganizationProvisionError } from "@insecur/onboarding";
import { InjectionGrantError } from "@insecur/runtime-injection";
import { SecretWriteError } from "@insecur/secrets";
import { RuntimeConfigMissingError } from "@insecur/tenant-store";

const HTTP_STATUS_BY_CODE = new Map<KnownErrorCode, number>([
  [AUTH_ERROR_CODES.required, 401],
  [AUTH_ERROR_CODES.expired, 401],
  [AUTH_ERROR_CODES.invalid, 401],
  [AUTH_ERROR_CODES.insufficientScope, 403],
  [INJECTION_ERROR_CODES.grantDenied, 404],
  [INJECTION_ERROR_CODES.grantExpired, 404],
  [ONBOARDING_ERROR_CODES.alreadyProvisioned, 409],
  [ONBOARDING_ERROR_CODES.resourceConflict, 409],
  [STORE_ERROR_CODES.runtimeConfigMissing, 503],
  [VALIDATION_ERROR_CODES.invalidOpaqueResourceId, 400],
  [VALIDATION_ERROR_CODES.invalidVariableKey, 400],
  [VALIDATION_ERROR_CODES.invalidDisplayName, 400],
  [VALIDATION_ERROR_CODES.displayNameEmpty, 400],
  [SECRET_ERROR_CODES.invalidEncoding, 400],
  [SECRET_ERROR_CODES.emptyValue, 400],
  [SECRET_ERROR_CODES.inputRequired, 400],
  [SECRET_ERROR_CODES.valueTooLarge, 400],
]);

function messageForError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Request failed.";
}

function retryableForError(error: unknown): boolean {
  if (error instanceof SecretWriteError || error instanceof InjectionGrantError) {
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
  if (error instanceof GuidedOrganizationProvisionError) {
    return error.code;
  }
  if (error instanceof RuntimeConfigMissingError) {
    return STORE_ERROR_CODES.runtimeConfigMissing;
  }
  return readErrorCode(error) ?? VALIDATION_ERROR_CODES.invalidOpaqueResourceId;
}

export function httpStatusForKnownErrorCode(code: KnownErrorCode): number {
  return HTTP_STATUS_BY_CODE.get(code) ?? 500;
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
