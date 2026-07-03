import type { KnownErrorCode } from "@insecur/domain";

export class RuntimeInjectionPolicyError extends Error {
  readonly code: KnownErrorCode;

  constructor(code: KnownErrorCode, message: string) {
    super(message);
    this.name = "RuntimeInjectionPolicyError";
    this.code = code;
  }
}
