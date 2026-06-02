import type { KnownErrorCode } from "@insecur/domain";

export class SecretWriteError extends Error {
  readonly code: KnownErrorCode;
  readonly retryable: boolean;

  constructor(code: KnownErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "SecretWriteError";
    this.code = code;
    this.retryable = retryable;
  }
}
