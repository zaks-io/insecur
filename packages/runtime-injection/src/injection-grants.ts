import type { AuditActorRef, AuditOperationRef, AuditRequestRef } from "@insecur/audit";
import type {
  EnvironmentId,
  InjectionGrantId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretVersionId,
  VariableKey,
} from "@insecur/domain";

import { consumeInjectionGrantWithAudit } from "./consume-injection-grant.js";
import type { InjectionGrantIssueSelector } from "./injection-grant-selectors.js";
import { normalizeConsumeSelector } from "./injection-grant-selectors.js";
import { issueInjectionGrantWithAudit } from "./issue-injection-grant.js";

export type {
  InjectionGrantConsumeSelector,
  InjectionGrantIssueSelector,
} from "./injection-grant-selectors.js";

export interface IssueInjectionGrantInput {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  /** Exactly one Secret binding per grant (First Value: one `run --variable-key`). */
  selector: InjectionGrantIssueSelector;
  actor: AuditActorRef;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
}

export interface IssueInjectionGrantResult {
  grantId: InjectionGrantId;
  expiresAt: string;
  auditEventId?: string;
}

export interface ConsumeInjectionGrantInput {
  organizationId: OrganizationId;
  grantId: InjectionGrantId;
  /** Deliver by exact Variable Key when the grant was issued for that binding. */
  variableKey?: VariableKey;
  /** Deliver by exact Secret ID when the grant was issued for that binding. */
  secretId?: SecretId;
  actor: AuditActorRef;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
}

/**
 * One-time grant consume returns env entries for the child process only.
 * Values must not be logged or returned in metadata-only CLI/API envelopes.
 */
export interface ConsumeInjectionGrantResult {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  variableKey: VariableKey;
  /** Process-environment delivery only; never serialize to metadata envelopes. */
  valueUtf8: Uint8Array;
  auditEventId?: string;
}

/**
 * Issues a fresh short-lived Injection Grant for one exact Secret in a non-protected Environment.
 */
export function issueInjectionGrant(
  input: IssueInjectionGrantInput,
): Promise<IssueInjectionGrantResult> {
  return issueInjectionGrantWithAudit(input);
}

/**
 * Consumes a one-use Injection Grant and returns the bound Secret Version value for runtime delivery only.
 */
export function consumeInjectionGrant(
  input: ConsumeInjectionGrantInput,
): Promise<ConsumeInjectionGrantResult> {
  return consumeInjectionGrantWithAudit({
    organizationId: input.organizationId,
    grantId: input.grantId,
    selector: normalizeConsumeSelector({
      ...(input.variableKey !== undefined ? { variableKey: input.variableKey } : {}),
      ...(input.secretId !== undefined ? { secretId: input.secretId } : {}),
    }),
    actor: input.actor,
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  });
}
