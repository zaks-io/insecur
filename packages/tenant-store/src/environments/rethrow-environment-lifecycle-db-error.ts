import { ENVIRONMENT_ERROR_CODES } from "@insecur/domain";

import { EnvironmentLifecycleStoreError } from "./errors.js";

export const ENVIRONMENT_LIFECYCLE_IMMUTABLE_DB_MESSAGE =
  "lifecycle stage and protected posture cannot change after creation";

export function isEnvironmentLifecycleImmutableViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23514" &&
    "message" in error &&
    typeof (error as { message: string }).message === "string" &&
    (error as { message: string }).message.includes(ENVIRONMENT_LIFECYCLE_IMMUTABLE_DB_MESSAGE)
  );
}

/** Maps the lifecycle-immutability trigger violation to a stable domain error code. */
export function rethrowEnvironmentLifecycleDbError(error: unknown): never {
  if (isEnvironmentLifecycleImmutableViolation(error)) {
    throw new EnvironmentLifecycleStoreError(
      ENVIRONMENT_ERROR_CODES.lifecycleImmutable,
      ENVIRONMENT_LIFECYCLE_IMMUTABLE_DB_MESSAGE,
    );
  }
  throw error;
}
