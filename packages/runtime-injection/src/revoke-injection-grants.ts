import type { AuditActorRef, AuditOperationRef, AuditRequestRef } from "@insecur/audit";
import {
  recordInjectionGrantRevocationAudit,
  type RecordInjectionGrantRevocationAuditInput,
} from "@insecur/audit";
import type { InjectionGrantId, OrganizationId, SecretVersionId } from "@insecur/domain";
import { TenantInjectionGrantStore, withTenantScope } from "@insecur/tenant-store";

export interface RevokeInjectionGrantsForTenantSuspensionInput {
  organizationId: OrganizationId;
  actor: AuditActorRef;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
}

export interface RevokeInjectionGrantsForTenantSuspensionResult {
  revokedGrantIds: readonly InjectionGrantId[];
  auditEventId?: string;
}

export interface RevokeInjectionGrantsForCompromiseVersionInput {
  organizationId: OrganizationId;
  secretVersionId: SecretVersionId;
  actor: AuditActorRef;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
}

export interface RevokeInjectionGrantsForCompromiseVersionResult {
  revokedGrantIds: readonly InjectionGrantId[];
  auditEventId?: string;
}

type RevocationCorrelation = Pick<
  RevokeInjectionGrantsForTenantSuspensionInput,
  "actor" | "organizationId" | "request" | "operation"
>;

async function revokeActiveGrantsAndAudit(
  correlation: RevocationCorrelation,
  revoke: (store: TenantInjectionGrantStore) => Promise<InjectionGrantId[]>,
  audit: Omit<RecordInjectionGrantRevocationAuditInput, keyof RevocationCorrelation | "outcome">,
): Promise<{ revokedGrantIds: readonly InjectionGrantId[]; auditEventId?: string }> {
  const revokedGrantIds = await withTenantScope(
    { kind: "organization", organizationId: correlation.organizationId },
    async ({ db }) => revoke(new TenantInjectionGrantStore(db)),
  );

  const auditEvent = await recordInjectionGrantRevocationAudit({
    ...audit,
    outcome: "success",
    actor: correlation.actor,
    organizationId: correlation.organizationId,
    revokedGrantCount: revokedGrantIds.length,
    ...(correlation.request !== undefined ? { request: correlation.request } : {}),
    ...(correlation.operation !== undefined ? { operation: correlation.operation } : {}),
  });

  return {
    revokedGrantIds,
    ...(auditEvent?.auditEventId !== undefined ? { auditEventId: auditEvent.auditEventId } : {}),
  };
}

/**
 * Revokes every active Injection Grant for a suspended Organization.
 * Revocation is terminal and survives tenant reinstatement.
 */
export async function revokeInjectionGrantsForTenantSuspension(
  input: RevokeInjectionGrantsForTenantSuspensionInput,
): Promise<RevokeInjectionGrantsForTenantSuspensionResult> {
  return revokeActiveGrantsAndAudit(
    input,
    (store) => store.revokeActiveGrantsForOrganization(input.organizationId),
    { verb: "tenant_suspension" },
  );
}

/**
 * Revokes active Injection Grants whose pinned secret version matches the invalidated version.
 */
export async function revokeInjectionGrantsForCompromiseVersion(
  input: RevokeInjectionGrantsForCompromiseVersionInput,
): Promise<RevokeInjectionGrantsForCompromiseVersionResult> {
  return revokeActiveGrantsAndAudit(
    input,
    (store) =>
      store.revokeActiveGrantsForSecretVersion(input.organizationId, input.secretVersionId),
    { verb: "compromise_version_invalidation", secretVersionId: input.secretVersionId },
  );
}
