import type { AuditActorRef, AuditOperationRef, AuditRequestRef } from "@insecur/audit";
import {
  INJECTION_ERROR_CODES,
  injectionGrantId,
  secretId,
  type EnvironmentId,
  type InjectionGrantId,
  type OrganizationId,
  type ProjectId,
  type VariableKey,
} from "@insecur/domain";
import {
  TenantInjectionGrantStore,
  TenantSecretVersionStore,
  withTenantScope,
} from "@insecur/tenant-store";

import { assertRuntimeInjectionAccess, ISSUE_SCOPE } from "./assert-runtime-injection-access.js";
import { computeInjectionGrantExpiresAt } from "./injection-grant-ttl.js";
import { InjectionGrantError } from "./injection-grant-error.js";
import { recordInjectionGrantAudit } from "./record-injection-grant-audit.js";

export interface IssueInjectionGrantCoreInput {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  variableKeys: readonly [VariableKey, ...VariableKey[]];
  actor: AuditActorRef;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
}

export interface IssueInjectionGrantCoreResult {
  grantId: InjectionGrantId;
  expiresAt: string;
  auditEventId?: string;
}

async function assertSecretsExistForKeys(
  organizationId: OrganizationId,
  environmentId: EnvironmentId,
  variableKeys: readonly VariableKey[],
): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId }, async (sql) => {
    const versionStore = new TenantSecretVersionStore(sql);
    for (const variableKey of variableKeys) {
      const rows = await sql<{ id: string }[]>`
        SELECT id
        FROM secrets
        WHERE environment_id = ${environmentId}
          AND variable_key = ${variableKey}
        LIMIT 1
      `;
      const secretRow = rows[0];
      if (!secretRow) {
        throw new InjectionGrantError(
          INJECTION_ERROR_CODES.grantDenied,
          "no secret for requested variable key",
        );
      }
      const current = await versionStore.getCurrentVersion(secretId.brand(secretRow.id));
      if (!current) {
        throw new InjectionGrantError(
          INJECTION_ERROR_CODES.grantDenied,
          "secret has no current version",
        );
      }
    }
  });
}

export async function executeIssueInjectionGrant(
  input: IssueInjectionGrantCoreInput,
): Promise<IssueInjectionGrantCoreResult> {
  const coordinate = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  };

  await assertRuntimeInjectionAccess(
    { type: "user", userId: input.actor.userId },
    coordinate,
    ISSUE_SCOPE,
  );

  await assertSecretsExistForKeys(input.organizationId, input.environmentId, input.variableKeys);

  const grantId = injectionGrantId.generate();
  const expiresAtDate = computeInjectionGrantExpiresAt();

  await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async (sql) => {
      const grantStore = new TenantInjectionGrantStore(sql);
      await grantStore.assertNonProtectedEnvironment(input.organizationId, input.environmentId);
      await grantStore.insertGrant({
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        grantId,
        variableKeys: input.variableKeys,
        expiresAt: expiresAtDate,
      });
    },
  );

  const audit = await recordInjectionGrantAudit({
    phase: "issue",
    outcome: "success",
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    grantId,
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  });

  return {
    grantId,
    expiresAt: expiresAtDate.toISOString(),
    ...(audit?.auditEventId !== undefined ? { auditEventId: audit.auditEventId } : {}),
  };
}

export async function recordDeniedIssue(
  input: IssueInjectionGrantCoreInput,
  reasonCode: InjectionGrantError["code"],
): Promise<void> {
  await recordInjectionGrantAudit({
    phase: "issue",
    outcome: "denied",
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    reasonCode,
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  });
}

export async function issueInjectionGrantWithAudit(
  input: IssueInjectionGrantCoreInput,
): Promise<IssueInjectionGrantCoreResult> {
  try {
    return await executeIssueInjectionGrant(input);
  } catch (error) {
    if (error instanceof InjectionGrantError) {
      await recordDeniedIssue(input, error.code).catch(() => undefined);
    } else if (error instanceof Error && error.message.includes("protected")) {
      await recordDeniedIssue(input, INJECTION_ERROR_CODES.grantDenied).catch(() => undefined);
    }
    throw error;
  }
}
