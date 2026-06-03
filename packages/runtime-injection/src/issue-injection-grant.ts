import {
  isInsufficientScopeAccessDenial,
  recordAccessDenialOnInsufficientScope,
} from "@insecur/access";
import type { AuditActorRef, AuditOperationRef, AuditRequestRef } from "@insecur/audit";
import { INJECTION_ERROR_CODES, injectionGrantId, type InjectionGrantId } from "@insecur/domain";
import {
  ProjectEnvironmentCoordinateError,
  SecretVersionStoreConflictError,
  SecretVersionStoreNotFoundError,
  TenantInjectionGrantStore,
  withTenantScope,
} from "@insecur/tenant-store";

import { assertRuntimeInjectionAccess, ISSUE_SCOPE } from "./assert-runtime-injection-access.js";
import { computeInjectionGrantExpiresAt } from "./injection-grant-ttl.js";
import { InjectionGrantError } from "./injection-grant-error.js";
import {
  assertSingleIssueSelectorCount,
  type InjectionGrantIssueSelector,
} from "./injection-grant-selectors.js";
import { recordInjectionGrantAudit } from "./record-injection-grant-audit.js";
import {
  resolveInjectionGrantBinding,
  type GrantCoordinate,
} from "./resolve-injection-grant-bindings.js";

export interface IssueInjectionGrantCoreInput {
  organizationId: GrantCoordinate["organizationId"];
  projectId: GrantCoordinate["projectId"];
  environmentId: GrantCoordinate["environmentId"];
  selector: InjectionGrantIssueSelector;
  actor: AuditActorRef;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
}

export interface IssueInjectionGrantCoreResult {
  grantId: InjectionGrantId;
  expiresAt: string;
  auditEventId?: string;
}

function toGrantCoordinate(input: IssueInjectionGrantCoreInput): GrantCoordinate {
  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  };
}

export async function executeIssueInjectionGrant(
  input: IssueInjectionGrantCoreInput,
): Promise<IssueInjectionGrantCoreResult> {
  const coordinate = toGrantCoordinate(input);

  await assertRuntimeInjectionAccess(
    { type: "user", userId: input.actor.userId },
    coordinate,
    ISSUE_SCOPE,
  );

  await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async (sql) => {
      await new TenantInjectionGrantStore(sql).assertIssueCoordinate(coordinate);
    },
  );

  assertSingleIssueSelectorCount(1);

  const binding = await resolveInjectionGrantBinding(coordinate, input.selector);

  const grantId = injectionGrantId.generate();
  const expiresAtDate = computeInjectionGrantExpiresAt();

  await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async (sql) => {
      await new TenantInjectionGrantStore(sql).insertGrant({
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        grantId,
        binding,
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
      const isAccessDenial = isInsufficientScopeAccessDenial(error, InjectionGrantError);
      await recordAccessDenialOnInsufficientScope(error, {
        isAccessDenial: () => isAccessDenial,
        recordDenial: () => recordDeniedIssue(input, error.code),
      });
      if (!isAccessDenial) {
        await recordDeniedIssue(input, error.code).catch(() => undefined);
      }
    } else if (error instanceof ProjectEnvironmentCoordinateError) {
      await recordDeniedIssue(input, INJECTION_ERROR_CODES.grantDenied).catch(() => undefined);
      throw new InjectionGrantError(
        INJECTION_ERROR_CODES.grantDenied,
        "project environment coordinate invalid",
      );
    } else if (
      error instanceof SecretVersionStoreNotFoundError ||
      error instanceof SecretVersionStoreConflictError
    ) {
      await recordDeniedIssue(input, INJECTION_ERROR_CODES.grantDenied).catch(() => undefined);
      throw new InjectionGrantError(
        INJECTION_ERROR_CODES.grantDenied,
        "injection grant selector does not resolve to a secret",
      );
    }
    throw error;
  }
}
