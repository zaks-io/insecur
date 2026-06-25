import { ENVIRONMENT_ERROR_CODES } from "@insecur/domain";

export class EnvironmentLifecycleStoreError extends Error {
  constructor(
    readonly code: (typeof ENVIRONMENT_ERROR_CODES)[keyof typeof ENVIRONMENT_ERROR_CODES],
    message: string,
  ) {
    super(message);
    this.name = "EnvironmentLifecycleStoreError";
  }
}
