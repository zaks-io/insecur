import { EffectiveAccessMemo, auditAccessDenialOnFailure, type ActorRef } from "@insecur/access";
import {
  recordRuntimeInjectionAudit,
  recordRuntimeInjectionAuditInTenantScope,
  type AuditActorRef,
  type AuditOperationRef,
  type AuditRequestRef,
} from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  INJECTION_ERROR_CODES,
  injectionGrantId,
  type InjectionGrantId,
  type RuntimePolicyId,
  type RuntimePolicyVersionId,
} from "@insecur/domain";
import {
  assertProjectEnvironmentCoordinateWithScope,
  SecretVersionStoreConflictError,
  SecretVersionStoreNotFoundError,
  TenantInjectionGrantStore,
  type ResolvedInjectionGrantBinding,
  withTenantScope,
} from "@insecur/tenant-store";

import {
  assertHoldsAnyIssuanceScope,
  assertRuntimeInjectionAccess,
  resolveIssueGrantRequiredScope,
} from "./assert-runtime-injection-access.js";
import { assertRuntimePolicyKeyAllowsGrantSelector } from "./assert-runtime-policy-key-grant-binding.js";
import { InjectionGrantError } from "./injection-grant-error.js";
import {
  assertSingleIssueSelectorCount,
  type InjectionGrantIssueSelector,
} from "./injection-grant-selectors.js";
import {
  computeInjectionGrantExpiresAt,
  computeInjectionGrantExpiresAtFromTtl,
} from "./injection-grant-ttl.js";
import { type GrantCoordinate } from "./resolve-injection-grant-bindings.js";
import { resolveInjectionGrantBindings } from "./resolve-policy-grant-bindings.js";

export interface IssueInjectionGrantCoreInput {
  organizationId: GrantCoordinate["organizationId"];
  projectId: GrantCoordinate["projectId"];
  environmentId: GrantCoordinate["environmentId"];
  selector: InjectionGrantIssueSelector;
  actor: ActorRef;
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

async function assertIssueGrantCoordinate(
  coordinate: GrantCoordinate,
): Promise<{ isProtected: boolean }> {
  return await assertProjectEnvironmentCoordinateWithScope({
    coordinate,
    createCoordinateError: () =>
      new InjectionGrantError(
        INJECTION_ERROR_CODES.grantDenied,
        "project environment coordinate invalid",
      ),
  });
}

function auditActorForIssue(actor: ActorRef): AuditActorRef {
  if (actor.type === "user") {
    return { type: "user", userId: actor.userId };
  }
  return { type: "machine", machineIdentityId: actor.machineIdentityId };
}

function buildGrantInsert(
  resolvedBindings: Awaited<ReturnType<typeof resolveInjectionGrantBindings>>,
): {
  bindings: readonly ResolvedInjectionGrantBinding[];
  policyId?: RuntimePolicyId;
  policyVersionId?: RuntimePolicyVersionId;
} {
  if (resolvedBindings.kind === "policy") {
    return {
      bindings: resolvedBindings.resolved.bindings,
      policyId: resolvedBindings.resolved.policyId,
      policyVersionId: resolvedBindings.resolved.policyVersionId,
    };
  }
  return { bindings: [resolvedBindings.binding] };
}

async function persistIssuedGrant(input: {
  readonly organizationId: IssueInjectionGrantCoreInput["organizationId"];
  readonly projectId: IssueInjectionGrantCoreInput["projectId"];
  readonly environmentId: IssueInjectionGrantCoreInput["environmentId"];
  readonly grantId: InjectionGrantId;
  readonly grantInsert: ReturnType<typeof buildGrantInsert>;
  readonly expiresAtDate: Date;
  readonly auditActor: AuditActorRef;
  readonly request?: AuditRequestRef;
  readonly operation?: AuditOperationRef;
}): Promise<{ auditEventId?: string }> {
  return await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db, sql }) => {
      await new TenantInjectionGrantStore(db).insertGrant({
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        grantId: input.grantId,
        ...input.grantInsert,
        expiresAt: input.expiresAtDate,
      });

      return recordRuntimeInjectionAuditInTenantScope(sql, {
        phase: "issue",
        outcome: "success",
        actor: input.auditActor,
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        grantId: input.grantId,
        ...(input.request !== undefined ? { request: input.request } : {}),
        ...(input.operation !== undefined ? { operation: input.operation } : {}),
      });
    },
  );
}

export async function executeIssueInjectionGrant(
  input: IssueInjectionGrantCoreInput,
): Promise<IssueInjectionGrantCoreResult> {
  const coordinate = toGrantCoordinate(input);
  const auditActor = auditActorForIssue(input.actor);
  // One request-scoped memo so the pre-check and the precise-atom check share a single membership
  // read instead of issuing two identical queries on this hot path.
  const accessDeps = { memo: new EffectiveAccessMemo() };

  // Fail closed before the tenant coordinate read: an actor holding neither issuance atom must not
  // be able to distinguish a valid foreign coordinate (grant_denied) from an invalid one
  // (insufficient_scope) (INS-181).
  await assertHoldsAnyIssuanceScope(input.actor, coordinate, accessDeps);

  const { isProtected } = await assertIssueGrantCoordinate(coordinate);

  await assertRuntimeInjectionAccess(
    input.actor,
    coordinate,
    resolveIssueGrantRequiredScope(isProtected),
    accessDeps,
  );

  assertSingleIssueSelectorCount(input.selector);

  await assertRuntimePolicyKeyAllowsGrantSelector(input.actor, coordinate, input.selector);

  const resolvedBindings = await resolveInjectionGrantBindings(coordinate, input.selector);
  const grantId = injectionGrantId.generate();
  const expiresAtDate =
    resolvedBindings.kind === "policy"
      ? computeInjectionGrantExpiresAtFromTtl(resolvedBindings.resolved.ttlSeconds)
      : computeInjectionGrantExpiresAt();
  const grantInsert = buildGrantInsert(resolvedBindings);

  const audit = await persistIssuedGrant({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    grantId,
    grantInsert,
    expiresAtDate,
    auditActor,
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  });

  return {
    grantId,
    expiresAt: expiresAtDate.toISOString(),
    ...(audit.auditEventId !== undefined ? { auditEventId: audit.auditEventId } : {}),
  };
}

export async function recordDeniedIssue(
  input: IssueInjectionGrantCoreInput,
  reasonCode: InjectionGrantError["code"],
): Promise<void> {
  const auditActor = auditActorForIssue(input.actor);
  await recordRuntimeInjectionAudit({
    phase: "issue",
    outcome: "denied",
    actor: auditActor,
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
