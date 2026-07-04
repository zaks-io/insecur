import { auditAccessDenialOnFailure } from "@insecur/access";
import type { AuditActorRef, AuditOperationRef, AuditRequestRef } from "@insecur/audit";
import {
  encryptSecretValue,
  toStoreFacingCiphertext,
  type Keyring,
  type WrappedSecretValue,
} from "@insecur/crypto";
import type {
  EnvironmentId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretVersionId,
  VariableKey,
} from "@insecur/domain";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import { secretVersionId } from "@insecur/domain";
import {
  TenantEnvironmentLifecycleStore,
  TenantSecretVersionStore,
  withTenantScope,
  type AppendSecretVersionResult,
  type EnvironmentLifecycleRow,
  type SecretVersionLifecycleState,
  type StoredWrappedSecretMaterial,
} from "@insecur/tenant-store";

import { SecretWriteError } from "./secret-write-error.js";
import {
  recordDeniedSecretStorageWriteAudit,
  recordSecretStorageWriteAudit,
  type SecretStorageWriteAuditKind,
} from "./record-secret-storage-write-audit.js";
import { validateTextSecretValue } from "./validate-text-secret-value.js";
import { validateVariableKeyForWrite } from "./validate-variable-key-for-write.js";

export interface BlindSecretWriteInput {
  keyring: Keyring;
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  variableKey: VariableKey;
  actor: AuditActorRef;
  secretId?: SecretId;
  valueUtf8: Uint8Array;
  allowEmpty?: boolean;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
}

export interface BlindSecretWriteResult {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  variableKey: VariableKey;
  lifecycleState: SecretVersionLifecycleState;
  createdSecretShape: boolean;
  auditEventId?: string;
}

export function toStoredWrappedSecretMaterial(
  wrapped: WrappedSecretValue,
): StoredWrappedSecretMaterial {
  return {
    organizationDataKeyVersion: wrapped.organizationDataKeyVersion,
    projectDataKeyVersion: wrapped.projectDataKeyVersion,
    ciphertext: toStoreFacingCiphertext(wrapped),
  };
}

type ValidatedBlindWriteInput = BlindSecretWriteInput & { variableKey: VariableKey };

export type BlindSecretWriteMode = "non_protected_live" | "protected_draft";

function auditKindForMode(mode: BlindSecretWriteMode): SecretStorageWriteAuditKind {
  return mode === "protected_draft" ? "protected_draft" : "non_protected";
}

async function appendEncryptedVersionForWrite(
  validatedInput: ValidatedBlindWriteInput,
  newVersionId: SecretVersionId,
  mode: BlindSecretWriteMode,
  assertEnvironment: (environment: EnvironmentLifecycleRow | null) => void,
): Promise<AppendSecretVersionResult> {
  return withTenantScope(
    { kind: "organization", organizationId: validatedInput.organizationId },
    async ({ db }) => {
      const environmentStore = new TenantEnvironmentLifecycleStore(db);
      const environment = await environmentStore.getById(
        validatedInput.organizationId,
        validatedInput.environmentId,
      );
      assertEnvironment(environment);

      const store = new TenantSecretVersionStore(db);
      const resolved = await store.resolveSecretForWrite({
        organizationId: validatedInput.organizationId,
        projectId: validatedInput.projectId,
        environmentId: validatedInput.environmentId,
        variableKey: validatedInput.variableKey,
        ...(validatedInput.secretId !== undefined ? { secretId: validatedInput.secretId } : {}),
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

      const appendInput = {
        organizationId: validatedInput.organizationId,
        secretId: resolved.secretId,
        secretVersionId: newVersionId,
        wrapped: toStoredWrappedSecretMaterial(wrapped),
        createdSecretShape: resolved.createdSecretShape,
      };

      return mode === "protected_draft"
        ? store.appendVersionAsDraft(appendInput)
        : store.appendVersionAndMakeLive(appendInput);
    },
  );
}

async function executeBlindSecretWrite(
  input: BlindSecretWriteInput,
  mode: BlindSecretWriteMode,
  assertEnvironment: (environment: EnvironmentLifecycleRow | null) => void,
): Promise<BlindSecretWriteResult> {
  const variableKey = validateVariableKeyForWrite(input.variableKey);
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

  const audit = await recordSecretStorageWriteAudit(auditKindForMode(mode), {
    outcome: "success",
    actor: validatedInput.actor,
    organizationId: validatedInput.organizationId,
    projectId: validatedInput.projectId,
    environmentId: validatedInput.environmentId,
    secretId: persisted.secretId,
    secretVersionId: persisted.secretVersionId,
    ...(validatedInput.request !== undefined ? { request: validatedInput.request } : {}),
    ...(validatedInput.operation !== undefined ? { operation: validatedInput.operation } : {}),
  });

  return {
    secretId: persisted.secretId,
    secretVersionId: persisted.secretVersionId,
    variableKey: validatedInput.variableKey,
    lifecycleState: persisted.lifecycleState,
    createdSecretShape: persisted.createdSecretShape,
    auditEventId: audit.auditEventId,
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
