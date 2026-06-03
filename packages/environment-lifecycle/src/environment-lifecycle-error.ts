import type { AuthErrorCode, EnvironmentErrorCode, KnownErrorCode } from "@insecur/domain";

export class EnvironmentLifecycleError extends Error {
  readonly code: KnownErrorCode;
  readonly retryable = false;

  constructor(code: AuthErrorCode | EnvironmentErrorCode, message: string) {
    super(message);
    this.name = "EnvironmentLifecycleError";
    this.code = code;
  }
}
