import { auditAccessDenialOnFailure } from "@insecur/access";
import { encryptSecretValue } from "@insecur/crypto";
import type { SecretVersionId } from "@insecur/domain";
import { AUTH_ERROR_CODES, IMPORT_ERROR_CODES, secretVersionId } from "@insecur/domain";
import {
  SecretVersionStoreCurrentVersionExistsError,
  type EnvironmentLifecycleRow,
} from "@insecur/tenant-store";
import { computeSecretWriteDescriptiveVerdicts } from "@insecur/secret-store-contracts";

import type {
  BlindSecretWriteInput,
  BlindSecretWriteMode,
  BlindSecretWriteResult,
  ValidatedBlindWriteInput,
} from "./blind-secret-write-types.js";
import {
  appendWrappedVersionForWrite,
  auditKindForMode,
  resolveWritableSecretForWrite,
  type PersistedSecretVersionWithAudit,
} from "./blind-secret-write-persist.js";
import { SecretWriteError } from "./secret-write-error.js";
import { recordDeniedSecretStorageWriteAudit } from "./record-secret-storage-write-audit.js";
import { validateTextSecretValue } from "./validate-text-secret-value.js";
import { validateVariableKeyForWrite } from "./validate-variable-key-for-write.js";
import { assertCreateOnlySecretWrite } from "./assert-create-only-secret-write.js";

export type {
  BlindSecretWriteInput,
  BlindSecretWriteMode,
  BlindSecretWriteResult,
} from "./blind-secret-write-types.js";

async function appendEncryptedVersionForWrite(
  validatedInput: ValidatedBlindWriteInput,
  newVersionId: SecretVersionId,
  mode: BlindSecretWriteMode,
  assertEnvironment: (environment: EnvironmentLifecycleRow | null) => void,
): Promise<PersistedSecretVersionWithAudit> {
  const resolved = await resolveWritableSecretForWrite(validatedInput, assertEnvironment);
  assertCreateOnlySecretWrite({
    ...(validatedInput.createOnly !== undefined ? { createOnly: validatedInput.createOnly } : {}),
    createdSecretShape: resolved.createdSecretShape,
  });
  const descriptiveVerdicts = computeSecretWriteDescriptiveVerdicts({
    valueUtf8: validatedInput.valueUtf8,
    ...(validatedInput.generationHint !== undefined
      ? { generationHint: validatedInput.generationHint }
      : {}),
  });
  const wrapped = await encryptSecretValue(
    validatedInput.keyring,
    {
      organizationId: validatedInput.organizationId,
      projectId: validatedInput.projectId,
      environmentId: validatedInput.environmentId,
      secretId: resolved.secretId,
    },
    validatedInput.valueUtf8,
  );
  try {
    return await appendWrappedVersionForWrite({
      validatedInput,
      newVersionId,
      mode,
      resolved,
      wrapped,
      descriptiveVerdicts,
    });
  } catch (error) {
    if (error instanceof SecretVersionStoreCurrentVersionExistsError) {
      throw new SecretWriteError(
        IMPORT_ERROR_CODES.existingSecret,
        "Secret already has a Current Version in the target environment.",
      );
    }
    throw error;
  }
}

async function executeBlindSecretWrite(
  input: BlindSecretWriteInput,
  mode: BlindSecretWriteMode,
  assertEnvironment: (environment: EnvironmentLifecycleRow | null) => void,
): Promise<BlindSecretWriteResult> {
  const variableKey = validateVariableKeyForWrite(input.variableKey);
  if (input.ifCurrentVersionAbsent === true && mode !== "non_protected_live") {
    // Fail loud instead of silently dropping a write guard: a Draft append never touches the
    // Current Version, so the version-conditional guard cannot be honored there.
    throw new Error("ifCurrentVersionAbsent applies to non-protected live writes only");
  }
  const validatedInput: ValidatedBlindWriteInput = { ...input, variableKey };
  validateTextSecretValue(
    validatedInput.valueUtf8,
    validatedInput.allowEmpty === true ? { allowEmpty: true } : {},
  );
  const newVersionId = secretVersionId.generate();
  const persisted = await appendEncryptedVersionForWrite(
    validatedInput,
    newVersionId,
    mode,
    assertEnvironment,
  );

  return {
    secretId: persisted.secretId,
    secretVersionId: persisted.secretVersionId,
    variableKey: validatedInput.variableKey,
    lifecycleState: persisted.lifecycleState,
    createdSecretShape: persisted.createdSecretShape,
    descriptiveVerdicts: persisted.descriptiveVerdicts,
    ...(persisted.auditEventId !== undefined ? { auditEventId: persisted.auditEventId } : {}),
  };
}

function isInsufficientScopeSecretWriteError(error: unknown): error is SecretWriteError {
  return error instanceof SecretWriteError && error.code === AUTH_ERROR_CODES.insufficientScope;
}

export async function runBlindSecretWrite(
  input: BlindSecretWriteInput,
  mode: BlindSecretWriteMode,
  assertEnvironment: (environment: EnvironmentLifecycleRow | null) => void,
): Promise<BlindSecretWriteResult> {
  const auditKind = auditKindForMode(mode);
  try {
    return await executeBlindSecretWrite(input, mode, assertEnvironment);
  } catch (error) {
    const scope = [input.organizationId, input.projectId, input.environmentId] as const;
    const refs = [input.secretId, input.request, input.operation] as const;
    await auditAccessDenialOnFailure(error, {
      isAccessDenied: isInsufficientScopeSecretWriteError,
      recordDenied: () =>
        recordDeniedSecretStorageWriteAudit({
          kind: auditKind,
          actor: input.actor,
          scope,
          refs,
          reasonCode: AUTH_ERROR_CODES.insufficientScope,
        }),
    });
    if (error instanceof SecretWriteError && error.code !== AUTH_ERROR_CODES.insufficientScope) {
      await recordDeniedSecretStorageWriteAudit({
        kind: auditKind,
        actor: input.actor,
        scope,
        refs,
        reasonCode: error.code,
      }).catch(() => undefined);
    }
    throw error;
  }
}
