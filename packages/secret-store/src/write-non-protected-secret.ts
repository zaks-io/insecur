import { auditAccessDenialOnFailure } from "@insecur/access";
import type { AuditActorRef, AuditOperationRef, AuditRequestRef } from "@insecur/audit";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import {
  encryptSecretValue,
  toStoreFacingCiphertext,
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
import { secretVersionId } from "@insecur/domain";
import {
  TenantSecretVersionStore,
  withTenantScope,
  type AppendSecretVersionAndMakeLiveResult,
  type StoredWrappedSecretMaterial,
} from "@insecur/tenant-store";

import { recordSecretWriteAudit } from "./record-secret-write-audit.js";
import { SecretWriteError } from "./secret-write-error.js";
import { validateTextSecretValue } from "./validate-text-secret-value.js";
import { validateVariableKeyForWrite } from "./validate-variable-key-for-write.js";

export interface WriteNonProtectedSecretInput {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  variableKey: VariableKey;
  actor: AuditActorRef;
  /** Existing secret selector; omit to create-or-update by Variable Key. */
  secretId?: SecretId;
  /**
   * UTF-8 secret bytes from a safe input path (stdin, generation service, request body).
   * Never include in metadata-only outputs.
   */
  valueUtf8: Uint8Array;
  allowEmpty?: boolean;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
}

/** Metadata-only secret write result. */
export interface WriteNonProtectedSecretResult {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  variableKey: VariableKey;
  createdSecretShape: boolean;
  auditEventId?: string;
}

/** Maps encryption output to store-facing wrapped material (no identity echo). */
export function toStoredWrappedSecretMaterial(
  wrapped: WrappedSecretValue,
): StoredWrappedSecretMaterial {
  return {
    organizationDataKeyVersion: wrapped.organizationDataKeyVersion,
    projectDataKeyVersion: wrapped.projectDataKeyVersion,
    ciphertext: toStoreFacingCiphertext(wrapped),
  };
}

async function recordDeniedWrite(
  input: WriteNonProtectedSecretInput,
  reasonCode: SecretWriteError["code"],
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
    reasonCode,
  });
}

function isInsufficientScopeSecretWriteError(error: unknown): error is SecretWriteError {
  return error instanceof SecretWriteError && error.code === AUTH_ERROR_CODES.insufficientScope;
}

type ValidatedWriteInput = WriteNonProtectedSecretInput & { variableKey: VariableKey };

async function appendEncryptedVersionForWrite(
  validatedInput: ValidatedWriteInput,
  newVersionId: SecretVersionId,
): Promise<AppendSecretVersionAndMakeLiveResult> {
  return withTenantScope(
    { kind: "organization", organizationId: validatedInput.organizationId },
    async (sql) => {
      const store = new TenantSecretVersionStore(sql);
      const resolved = await store.resolveSecretForWrite({
        organizationId: validatedInput.organizationId,
        projectId: validatedInput.projectId,
        environmentId: validatedInput.environmentId,
        variableKey: validatedInput.variableKey,
        ...(validatedInput.secretId !== undefined ? { secretId: validatedInput.secretId } : {}),
      });

      const wrapped = await encryptSecretValue(
        {
          organizationId: validatedInput.organizationId,
          projectId: validatedInput.projectId,
          environmentId: validatedInput.environmentId,
          secretId: resolved.secretId,
        },
        validatedInput.valueUtf8,
      );

      return store.appendVersionAndMakeLive({
        organizationId: validatedInput.organizationId,
        secretId: resolved.secretId,
        secretVersionId: newVersionId,
        wrapped: toStoredWrappedSecretMaterial(wrapped),
        createdSecretShape: resolved.createdSecretShape,
      });
    },
  );
}

async function finishSuccessfulWrite(
  validatedInput: ValidatedWriteInput,
  persisted: AppendSecretVersionAndMakeLiveResult,
): Promise<WriteNonProtectedSecretResult> {
  const audit = await recordSecretWriteAudit({
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
    createdSecretShape: persisted.createdSecretShape,
    ...(audit?.auditEventId !== undefined ? { auditEventId: audit.auditEventId } : {}),
  };
}

async function executeWrite(
  input: WriteNonProtectedSecretInput,
): Promise<WriteNonProtectedSecretResult> {
  const variableKey = validateVariableKeyForWrite(input.variableKey);
  const validatedInput: ValidatedWriteInput = { ...input, variableKey };
  validateTextSecretValue(
    validatedInput.valueUtf8,
    validatedInput.allowEmpty === true ? { allowEmpty: true } : {},
  );
  const newVersionId = secretVersionId.generate();
  const persisted = await appendEncryptedVersionForWrite(validatedInput, newVersionId);
  return finishSuccessfulWrite(validatedInput, persisted);
}

/**
 * Non-protected Blind Secret Write create-or-update through the Secret Version Store.
 */
export async function writeNonProtectedSecret(
  input: WriteNonProtectedSecretInput,
): Promise<WriteNonProtectedSecretResult> {
  try {
    return await executeWrite(input);
  } catch (error) {
    await auditAccessDenialOnFailure(error, {
      isAccessDenied: isInsufficientScopeSecretWriteError,
      recordDenied: () => recordDeniedWrite(input, AUTH_ERROR_CODES.insufficientScope),
    });
    if (error instanceof SecretWriteError && error.code !== AUTH_ERROR_CODES.insufficientScope) {
      await recordDeniedWrite(input, error.code).catch(() => undefined);
    }
    throw error;
  }
}
