import type { KnownErrorCode } from "@insecur/domain";

export class InjectionGrantError extends Error {
  readonly code: KnownErrorCode;
  readonly retryable: boolean;

  constructor(code: KnownErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "InjectionGrantError";
    this.code = code;
    this.retryable = retryable;
  }
}
