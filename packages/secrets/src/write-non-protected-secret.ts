import type { AuditActorRef, AuditOperationRef, AuditRequestRef } from "@insecur/audit";
import type {
  EnvironmentId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretVersionId,
  VariableKey,
} from "@insecur/domain";
import { secretVersionId } from "@insecur/domain";

import { persistNonProtectedWrite, toWriteResult } from "./persist-non-protected-write.js";
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

async function maybeRecordDeniedWrite(
  input: WriteNonProtectedSecretInput,
  error: unknown,
): Promise<void> {
  if (error instanceof SecretWriteError) {
    await recordDeniedWrite(input, error.code);
  }
}

async function executeWrite(
  input: WriteNonProtectedSecretInput,
): Promise<WriteNonProtectedSecretResult> {
  const variableKey = validateVariableKeyForWrite(input.variableKey);
  const validatedInput = { ...input, variableKey };
  validateTextSecretValue(
    validatedInput.valueUtf8,
    validatedInput.allowEmpty === true ? { allowEmpty: true } : {},
  );
  const newVersionId = secretVersionId.generate();
  const persisted = await persistNonProtectedWrite(validatedInput, newVersionId);
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

  return toWriteResult(validatedInput, persisted, audit?.auditEventId);
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
    await maybeRecordDeniedWrite(input, error).catch(() => undefined);
    throw error;
  }
}
