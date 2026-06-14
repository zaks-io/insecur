import { auditAccessDenialOnFailure } from "@insecur/access";
import {
  recordRuntimeInjectionAudit,
  type AuditActorRef,
  type AuditOperationRef,
  type AuditRequestRef,
} from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  INJECTION_ERROR_CODES,
  injectionGrantId,
  type InjectionGrantId,
} from "@insecur/domain";
import {
  ProjectEnvironmentCoordinateError,
  SecretVersionStoreConflictError,
  SecretVersionStoreNotFoundError,
  TenantInjectionGrantStore,
  withTenantScope,
} from "@insecur/tenant-store";

import {
  assertHoldsAnyIssuanceScope,
  assertRuntimeInjectionAccess,
  resolveIssueGrantRequiredScope,
} from "./assert-runtime-injection-access.js";
import { computeInjectionGrantExpiresAt } from "./injection-grant-ttl.js";
import { InjectionGrantError } from "./injection-grant-error.js";
import {
  assertSingleIssueSelectorCount,
  type InjectionGrantIssueSelector,
} from "./injection-grant-selectors.js";
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
  const actor = { type: "user" as const, userId: input.actor.userId };

  // Fail closed before the tenant coordinate read: an actor holding neither issuance atom must not
  // be able to distinguish a valid foreign coordinate (grant_denied) from an invalid one
  // (insufficient_scope) (INS-181).
  await assertHoldsAnyIssuanceScope(actor, coordinate);

  const { isProtected } = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    ({ db }) => new TenantInjectionGrantStore(db).assertIssueCoordinate(coordinate),
  );

  await assertRuntimeInjectionAccess(
    actor,
    coordinate,
    resolveIssueGrantRequiredScope(isProtected),
  );

  assertSingleIssueSelectorCount(1);

  const binding = await resolveInjectionGrantBinding(coordinate, input.selector);

  const grantId = injectionGrantId.generate();
  const expiresAtDate = computeInjectionGrantExpiresAt();

  await withTenantScope({ kind: "organization", organizationId: input.organizationId }, ({ db }) =>
    new TenantInjectionGrantStore(db).insertGrant({
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      grantId,
      binding,
      expiresAt: expiresAtDate,
    }),
  );

  const audit = await recordRuntimeInjectionAudit({
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
  await recordRuntimeInjectionAudit({
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
      await auditAccessDenialOnFailure(error, {
        isAccessDenied: (candidate): candidate is InjectionGrantError =>
          candidate instanceof InjectionGrantError &&
          candidate.code === AUTH_ERROR_CODES.insufficientScope,
        recordDenied: () => recordDeniedIssue(input, AUTH_ERROR_CODES.insufficientScope),
      });
      if (error.code !== AUTH_ERROR_CODES.insufficientScope) {
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
