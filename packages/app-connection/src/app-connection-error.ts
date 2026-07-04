import { APP_CONNECTION_ERROR_CODES, type KnownErrorCode } from "@insecur/domain";

export class AppConnectionError extends Error {
  readonly code: KnownErrorCode;

  constructor(code: KnownErrorCode, message?: string) {
    super(message ?? code);
    this.name = "AppConnectionError";
    this.code = code;
  }
}

export function isAppConnectionError(error: unknown): error is AppConnectionError {
  return error instanceof AppConnectionError;
}

export { APP_CONNECTION_ERROR_CODES };
