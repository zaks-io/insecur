import { ENVIRONMENT_ERROR_CODES } from "@insecur/domain";
import type { EnvironmentLifecycleRow } from "@insecur/tenant-store";

import { SecretWriteError } from "./secret-write-error.js";

/**
 * Ensures the durable Environment posture allows non-protected Secret Version writes.
 * Posture must not create a delivery bypass for Protected Environments.
 */
export function assertEnvironmentAllowsNonProtectedWrite(
  environment: EnvironmentLifecycleRow | null,
): void {
  if (environment === null) {
    throw new SecretWriteError(ENVIRONMENT_ERROR_CODES.notFound, "environment not found");
  }
  if (environment.isProtected) {
    throw new SecretWriteError(
      ENVIRONMENT_ERROR_CODES.protectedEnvironment,
      "protected environment does not allow non-protected secret writes",
    );
  }
}
