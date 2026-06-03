import {
  auditAccessDenialOnFailure,
  type EffectiveAccessResult,
  type ResourceCoordinate,
} from "@insecur/access";
import { AUTH_ERROR_CODES } from "@insecur/domain";

import { assertSecretNonProtectedWriteAccess } from "./assert-secret-non-protected-write-access.js";
import { recordSecretWriteAudit } from "./record-secret-write-audit.js";
import { SecretWriteError } from "./secret-write-error.js";
import {
  type WriteNonProtectedSecretInput,
  type WriteNonProtectedSecretResult,
  writeNonProtectedSecret,
} from "./write-non-protected-secret.js";

export interface WriteAuthorizedNonProtectedSecretInput extends WriteNonProtectedSecretInput {
  /** Pre-resolved Effective Access from {@link resolveEffectiveAccess} at {@link accessCoordinate}. */
  effectiveAccess?: EffectiveAccessResult;
  /** Coordinate the Effective Access evidence was resolved for. */
  accessCoordinate?: ResourceCoordinate;
}

async function recordDeniedAuthorizedWrite(
  input: WriteAuthorizedNonProtectedSecretInput,
): Promise<void> {
  await recordSecretWriteAudit({
    outcome: "denied",
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    ...(input.secretId !== undefined ? { secretId: input.secretId } : {}),
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
    reasonCode: AUTH_ERROR_CODES.insufficientScope,
  });
}

/**
 * Authorized non-protected Blind Secret Write. Requires pre-resolved Effective Access evidence
 * with `secret:non_protected_write` at the write coordinate before validation or persistence.
 */
export async function writeAuthorizedNonProtectedSecret(
  input: WriteAuthorizedNonProtectedSecretInput,
): Promise<WriteNonProtectedSecretResult> {
  try {
    assertSecretNonProtectedWriteAccess(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
      },
      input.effectiveAccess,
      input.accessCoordinate,
    );
  } catch (error) {
    await auditAccessDenialOnFailure(error, {
      isAccessDenied: (candidate): candidate is SecretWriteError =>
        candidate instanceof SecretWriteError &&
        candidate.code === AUTH_ERROR_CODES.insufficientScope,
      recordDenied: () => recordDeniedAuthorizedWrite(input),
    });
    throw error;
  }

  return writeNonProtectedSecret(input);
}
