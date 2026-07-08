import {
  createAuthContext,
  createRequestId,
  AuthConfigError,
  AuthFailureError,
} from "@insecur/worker-kit";
import {
  errorEnvelope,
  readErrorCode,
  VALIDATION_ERROR_CODES,
  type ValidationErrorCode,
} from "@insecur/domain";
import type { Context } from "hono";
import { logUnhandledApiError } from "../../log-unhandled-error.js";

const VALIDATION_ERROR_CODE_SET = new Set<string>(Object.values(VALIDATION_ERROR_CODES));

export function readUserRouteValidationErrorCode(error: unknown): ValidationErrorCode | undefined {
  const code = readErrorCode(error);
  if (code === undefined || !VALIDATION_ERROR_CODE_SET.has(code)) {
    return undefined;
  }
  return code as ValidationErrorCode;
}

export function userRouteValidationErrorResponse(
  context: Context,
  error: unknown,
  code: ValidationErrorCode,
  message: string,
): Response {
  const reqId = createRequestId();
  return context.json(
    errorEnvelope(
      {
        code,
        message: error instanceof Error ? error.message : message,
        retryable: false,
      },
      { meta: { requestId: reqId } },
    ),
    400,
  );
}

export function returnUserRouteValidationErrorFromThrown(
  context: Context,
  error: unknown,
  message: string,
): Response | undefined {
  const validationCode = readUserRouteValidationErrorCode(error);
  if (validationCode === undefined) {
    return undefined;
  }
  return userRouteValidationErrorResponse(context, error, validationCode, message);
}

export function handleUserRouteSessionAssuranceFailure(
  context: Context,
  error: unknown,
  invalidBodyMessage: string,
): Response {
  if (error instanceof AuthFailureError || error instanceof AuthConfigError) {
    throw error;
  }
  const validationResponse = returnUserRouteValidationErrorFromThrown(
    context,
    error,
    invalidBodyMessage,
  );
  if (validationResponse !== undefined) {
    return validationResponse;
  }
  logUnhandledApiError(error);
  return context.text("Internal Server Error", 500);
}

function requestHeaderValue(
  context: { req: { header: (name: string) => string | undefined } },
  name: string,
): string | undefined {
  const value = context.req.header(name);
  return value === undefined || value.trim() === "" ? undefined : value;
}

export function requestHeadersForWorkOSStepUp(context: {
  req: { header: (name: string) => string | undefined };
}): {
  readonly ipAddress?: string;
  readonly userAgent?: string;
} {
  const ipAddress = requestHeaderValue(context, "cf-connecting-ip");
  const userAgent = requestHeaderValue(context, "user-agent");
  return {
    ...(ipAddress === undefined ? {} : { ipAddress }),
    ...(userAgent === undefined ? {} : { userAgent }),
  };
}

export { createAuthContext };
