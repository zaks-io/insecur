import type { AuditActorRef, AuditOperationRef, AuditRequestRef } from "@insecur/audit";
import {
  environmentId,
  INJECTION_ERROR_CODES,
  projectId,
  type EnvironmentId,
  type InjectionGrantId,
  type OrganizationId,
  type ProjectId,
  type VariableKey,
} from "@insecur/domain";
import {
  TenantInjectionGrantStore,
  type InjectionGrantConsumeFailure,
  withTenantScope,
} from "@insecur/tenant-store";

import { assertRuntimeInjectionAccess, CONSUME_SCOPE } from "./assert-runtime-injection-access.js";
import { decryptGrantSecretValue } from "./decrypt-grant-secret.js";
import { InjectionGrantError } from "./injection-grant-error.js";
import { recordInjectionGrantAudit } from "./record-injection-grant-audit.js";

export interface ConsumeInjectionGrantCoreInput {
  organizationId: OrganizationId;
  grantId: InjectionGrantId;
  variableKey: VariableKey;
  actor: AuditActorRef;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
}

export interface ConsumeInjectionGrantCoreResult {
  variableKey: VariableKey;
  valueUtf8: Uint8Array;
  auditEventId?: string;
}

function reasonCodeForConsumeFailure(
  reason: InjectionGrantConsumeFailure,
): (typeof INJECTION_ERROR_CODES)[keyof typeof INJECTION_ERROR_CODES] {
  if (reason === "expired") {
    return INJECTION_ERROR_CODES.grantExpired;
  }
  return INJECTION_ERROR_CODES.grantDenied;
}

async function loadGrantCoordinate(
  organizationId: OrganizationId,
  grantId: InjectionGrantId,
): Promise<{ projectId: ProjectId; environmentId: EnvironmentId } | undefined> {
  return withTenantScope({ kind: "organization", organizationId }, async (sql) => {
    const grant = await new TenantInjectionGrantStore(sql).getGrant(organizationId, grantId);
    if (!grant) {
      return undefined;
    }
    return {
      projectId: projectId.brand(grant.project_id),
      environmentId: environmentId.brand(grant.environment_id),
    };
  });
}

async function consumeGrantOnce(
  organizationId: OrganizationId,
  grantId: InjectionGrantId,
  variableKey: VariableKey,
) {
  return withTenantScope({ kind: "organization", organizationId }, (sql) =>
    new TenantInjectionGrantStore(sql).tryConsumeGrant(organizationId, grantId, variableKey),
  );
}

export async function executeConsumeInjectionGrant(
  input: ConsumeInjectionGrantCoreInput,
): Promise<ConsumeInjectionGrantCoreResult> {
  const coordinate = await loadGrantCoordinate(input.organizationId, input.grantId);
  if (!coordinate) {
    throw new InjectionGrantError(INJECTION_ERROR_CODES.grantDenied, "injection grant not found");
  }

  await assertRuntimeInjectionAccess(
    { type: "user", userId: input.actor.userId },
    {
      organizationId: input.organizationId,
      projectId: coordinate.projectId,
      environmentId: coordinate.environmentId,
    },
    CONSUME_SCOPE,
  );

  const consumeResult = await consumeGrantOnce(
    input.organizationId,
    input.grantId,
    input.variableKey,
  );
  if (!consumeResult.ok) {
    throw new InjectionGrantError(
      reasonCodeForConsumeFailure(consumeResult.reason),
      "injection grant consume denied",
    );
  }

  const plaintext = await decryptGrantSecretValue({
    organizationId: input.organizationId,
    projectId: coordinate.projectId,
    environmentId: coordinate.environmentId,
    variableKey: input.variableKey,
  });

  return buildConsumeSuccessResult(input, coordinate, plaintext);
}

async function buildConsumeSuccessResult(
  input: ConsumeInjectionGrantCoreInput,
  coordinate: { projectId: ProjectId; environmentId: EnvironmentId },
  plaintext: Uint8Array,
): Promise<ConsumeInjectionGrantCoreResult> {
  const audit = await recordInjectionGrantAudit({
    phase: "consume",
    outcome: "success",
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: coordinate.projectId,
    environmentId: coordinate.environmentId,
    grantId: input.grantId,
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  });

  return {
    variableKey: input.variableKey,
    valueUtf8: plaintext,
    ...(audit?.auditEventId !== undefined ? { auditEventId: audit.auditEventId } : {}),
  };
}

export async function recordDeniedConsume(
  input: ConsumeInjectionGrantCoreInput,
  reasonCode: InjectionGrantError["code"],
  coordinate?: { projectId: ProjectId; environmentId: EnvironmentId },
): Promise<void> {
  if (coordinate === undefined) {
    return;
  }
  await recordInjectionGrantAudit({
    phase: "consume",
    outcome: "denied",
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: coordinate.projectId,
    environmentId: coordinate.environmentId,
    grantId: input.grantId,
    reasonCode,
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  });
}

export async function consumeInjectionGrantWithAudit(
  input: ConsumeInjectionGrantCoreInput,
): Promise<ConsumeInjectionGrantCoreResult> {
  const coordinate = await loadGrantCoordinate(input.organizationId, input.grantId);
  try {
    return await executeConsumeInjectionGrant(input);
  } catch (error) {
    if (error instanceof InjectionGrantError) {
      await recordDeniedConsume(input, error.code, coordinate).catch(() => undefined);
    }
    throw error;
  }
}
