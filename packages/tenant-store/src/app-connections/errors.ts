import { APP_CONNECTION_ERROR_CODES, type AppConnectionErrorCode } from "@insecur/domain";

export class AppConnectionStoreError extends Error {
  readonly code: AppConnectionErrorCode;

  constructor(code: AppConnectionErrorCode, message?: string) {
    super(message ?? code);
    this.name = "AppConnectionStoreError";
    this.code = code;
  }
}

export function isAppConnectionStoreError(error: unknown): error is AppConnectionStoreError {
  return error instanceof AppConnectionStoreError;
}

export { APP_CONNECTION_ERROR_CODES as APP_CONNECTION_STORE_ERROR_CODES };
