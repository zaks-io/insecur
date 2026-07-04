import { ENVIRONMENT_ERROR_CODES } from "@insecur/domain";

import type { EnvironmentLifecycleRow } from "@insecur/tenant-store";

import { SecretWriteError } from "./secret-write-error.js";

/**
 * Ensures the durable Environment posture requires protected Draft Version writes.
 */
export function assertEnvironmentAllowsProtectedDraftWrite(
  environment: EnvironmentLifecycleRow | null,
): asserts environment is EnvironmentLifecycleRow {
  if (!environment) {
    throw new SecretWriteError(ENVIRONMENT_ERROR_CODES.notFound, "environment not found");
  }

  if (!environment.isProtected) {
    throw new SecretWriteError(
      ENVIRONMENT_ERROR_CODES.nonProtectedEnvironment,
      "non-protected environment does not allow protected draft secret writes",
    );
  }
}
