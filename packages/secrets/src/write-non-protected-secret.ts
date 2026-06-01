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
  validateTextSecretValue(input.valueUtf8, input.allowEmpty === true ? { allowEmpty: true } : {});
  const newVersionId = secretVersionId.generate();
  const persisted = await persistNonProtectedWrite(input, newVersionId);
  const audit = await recordSecretWriteAudit({
    outcome: "success",
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    secretId: persisted.secretId,
    secretVersionId: persisted.secretVersionId,
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  });

  return toWriteResult(input, persisted, audit?.auditEventId);
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
    await maybeRecordDeniedWrite(input, error);
    throw error;
  }
}
