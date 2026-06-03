import type { EnvironmentErrorCode } from "@insecur/domain";

export class EnvironmentLifecycleStoreError extends Error {
  readonly code: EnvironmentErrorCode;

  constructor(code: EnvironmentErrorCode, message: string) {
    super(message);
    this.name = "EnvironmentLifecycleStoreError";
    this.code = code;
  }
}
