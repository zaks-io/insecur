import { auditAccessDenialOnFailure } from "@insecur/access";
import { AUTH_ERROR_CODES } from "@insecur/domain";

import { EnvironmentLifecycleError } from "./environment-lifecycle-error.js";
import { type EnvironmentLifecycleAuditEventCode } from "./environment-lifecycle-audit-codes.js";
import { recordEnvironmentLifecycleAudit } from "./record-environment-lifecycle-audit.js";
import type { EnvironmentLifecycleActorInput } from "./types.js";
import type { EnvironmentLifecycleCoordinate } from "./assert-environment-lifecycle-access.js";

export interface RunWithEnvironmentLifecycleAccessAuditInput extends EnvironmentLifecycleActorInput {
  coordinate: EnvironmentLifecycleCoordinate;
  deniedEventCode: EnvironmentLifecycleAuditEventCode;
  assertAccess: () => void;
}

export async function runWithEnvironmentLifecycleAccessAudit<T>(
  input: RunWithEnvironmentLifecycleAccessAuditInput,
  run: () => Promise<T>,
): Promise<T> {
  try {
    input.assertAccess();
  } catch (error) {
    await auditAccessDenialOnFailure(error, {
      isAccessDenied: (candidate): candidate is EnvironmentLifecycleError =>
        candidate instanceof EnvironmentLifecycleError &&
        candidate.code === AUTH_ERROR_CODES.insufficientScope,
      recordDenied: async () => {
        await recordEnvironmentLifecycleAudit({
          outcome: "denied",
          eventCode: input.deniedEventCode,
          actor: input.actor,
          organizationId: input.coordinate.organizationId,
          projectId: input.coordinate.projectId,
          environmentId: input.coordinate.environmentId,
          ...(input.request !== undefined ? { request: input.request } : {}),
          reasonCode: AUTH_ERROR_CODES.insufficientScope,
        });
      },
    });
    throw error;
  }

  return run();
}
