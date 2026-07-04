import {
  auditAccessDenialOnFailure,
  AUTHORIZATION_SCOPES,
  type AuthorizationScope,
  type EffectiveAccessResult,
  type ResourceCoordinate,
} from "@insecur/access";
import { AUTH_ERROR_CODES } from "@insecur/domain";

import {
  assertSecretNonProtectedWriteAccess,
  assertSecretProtectedDraftWriteAccess,
  type SecretWriteAccessCoordinate,
} from "./assert-secret-write-access.js";
import {
  recordDeniedSecretStorageWriteAudit,
  type SecretStorageWriteAuditKind,
} from "./record-secret-storage-write-audit.js";
import { SecretWriteError } from "./secret-write-error.js";
import type { BlindSecretWriteInput } from "./blind-secret-write.js";

type AuthorizedBlindWriteInput = BlindSecretWriteInput & {
  effectiveAccess?: EffectiveAccessResult;
  accessCoordinate?: ResourceCoordinate;
};

export interface AuthorizedBlindSecretWriteOptions<T> {
  requiredScope: AuthorizationScope;
  denialMessage: string;
  assertAccess: (
    writeCoordinate: SecretWriteAccessCoordinate,
    effectiveAccess: EffectiveAccessResult | undefined,
    accessCoordinate: ResourceCoordinate | undefined,
  ) => void;
  write: (input: AuthorizedBlindWriteInput) => Promise<T>;
}

function auditKindForScope(scope: AuthorizationScope): SecretStorageWriteAuditKind {
  return scope === AUTHORIZATION_SCOPES.secretProtectedDraftWrite
    ? "protected_draft"
    : "non_protected";
}

export async function writeAuthorizedBlindSecretWrite<T>(
  input: AuthorizedBlindWriteInput,
  options: AuthorizedBlindSecretWriteOptions<T>,
): Promise<T> {
  const writeCoordinate = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  };

  try {
    options.assertAccess(writeCoordinate, input.effectiveAccess, input.accessCoordinate);
  } catch (error) {
    await auditAccessDenialOnFailure(error, {
      isAccessDenied: (candidate): candidate is SecretWriteError =>
        candidate instanceof SecretWriteError &&
        candidate.code === AUTH_ERROR_CODES.insufficientScope,
      recordDenied: () =>
        recordDeniedSecretStorageWriteAudit({
          kind: auditKindForScope(options.requiredScope),
          actor: input.actor,
          scope: [input.organizationId, input.projectId, input.environmentId],
          refs: [input.secretId, input.request, input.operation],
          reasonCode: AUTH_ERROR_CODES.insufficientScope,
        }),
    });
    throw error;
  }

  return options.write(input);
}

export { assertSecretNonProtectedWriteAccess, assertSecretProtectedDraftWriteAccess };
