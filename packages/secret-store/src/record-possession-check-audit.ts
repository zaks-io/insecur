import type { AuditActorRef, AuditRequestRef } from "@insecur/audit";
import { FIRST_VALUE_AUDIT_EVENT_CODES, recordActionAudit } from "@insecur/audit";
import {
  brandOpaqueResourceIdForPrefix,
  type EnvironmentId,
  type KnownErrorCode,
  type OrganizationId,
  type ProjectId,
  type SecretId,
} from "@insecur/domain";

export type PossessionVerdict = "match" | "mismatch";

/**
 * Stable dotted verdict codes stored in the audit detail map. Audit detail string values must be
 * stable dotted codes (ADR-0068 metadata-safe guard), so the bare `match`/`mismatch` verdict is
 * recorded as a dotted code here while the API payload keeps the plain verdict word.
 */
const POSSESSION_VERDICT_DETAIL_CODE: Record<PossessionVerdict, string> = {
  match: "secret.possession_match",
  mismatch: "secret.possession_mismatch",
};

interface PossessionCheckAuditScope {
  actor: AuditActorRef;
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  secretId?: SecretId;
  request?: AuditRequestRef;
}

interface CheckedPossessionAuditInput extends PossessionCheckAuditScope {
  verdict: PossessionVerdict;
}

interface DeniedPossessionAuditInput extends PossessionCheckAuditScope {
  reasonCode: KnownErrorCode;
}

function possessionCheckScopeFields(input: PossessionCheckAuditScope) {
  return {
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    ...(input.secretId !== undefined
      ? {
          resource: {
            type: "secret" as const,
            id: brandOpaqueResourceIdForPrefix("sec", input.secretId),
          },
        }
      : {}),
    ...(input.request !== undefined ? { request: input.request } : {}),
  };
}

/**
 * Metadata-only audit for a completed possession check. The verdict (`match`/`mismatch`) is the only
 * information recorded beyond scope: no candidate value, no digest, no length, no position.
 * An unaudited possession check is a silent guessing oracle (INS-403), so this is not optional.
 */
export async function recordPossessionCheckedAudit(
  input: CheckedPossessionAuditInput,
): Promise<{ auditEventId: string }> {
  const result = await recordActionAudit({
    ...possessionCheckScopeFields(input),
    outcome: "success",
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretPossessionChecked,
    details: { verdict: POSSESSION_VERDICT_DETAIL_CODE[input.verdict] },
  });
  return { auditEventId: result.auditEventId };
}

/** Metadata-only denied audit for a possession check that failed before a verdict was reached. */
export async function recordDeniedPossessionCheckAudit(
  input: DeniedPossessionAuditInput,
): Promise<void> {
  await recordActionAudit({
    ...possessionCheckScopeFields(input),
    outcome: "denied",
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretPossessionCheckDenied,
    reasonCode: input.reasonCode,
  });
}
