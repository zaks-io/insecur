import { RUNTIME_POLICY_ERROR_CODES } from "@insecur/domain";

export class RuntimeInjectionPolicyStoreError extends Error {
  readonly code: (typeof RUNTIME_POLICY_ERROR_CODES)[keyof typeof RUNTIME_POLICY_ERROR_CODES];

  constructor(
    code: (typeof RUNTIME_POLICY_ERROR_CODES)[keyof typeof RUNTIME_POLICY_ERROR_CODES],
    message: string,
  ) {
    super(message);
    this.name = "RuntimeInjectionPolicyStoreError";
    this.code = code;
  }
}
