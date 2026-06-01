import type { AuditActorRef, AuditOperationRef, AuditRequestRef } from "@insecur/audit";
import type {
  EnvironmentId,
  InjectionGrantId,
  OrganizationId,
  ProjectId,
  VariableKey,
} from "@insecur/domain";

import { consumeInjectionGrantWithAudit } from "./consume-injection-grant.js";
import { issueInjectionGrantWithAudit } from "./issue-injection-grant.js";

export interface IssueInjectionGrantInput {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  variableKeys: readonly [VariableKey, ...VariableKey[]];
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
  variableKey: VariableKey;
  actor: AuditActorRef;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
}

/**
 * One-time grant consume returns env entries for the child process only.
 * Values must not be logged or returned in metadata-only CLI/API envelopes.
 */
export interface ConsumeInjectionGrantResult {
  variableKey: VariableKey;
  /** Process-environment delivery only; never serialize to metadata envelopes. */
  valueUtf8: Uint8Array;
  auditEventId?: string;
}

/**
 * Issues a fresh short-lived Injection Grant for exact Variable Keys in a non-protected Environment.
 */
export function issueInjectionGrant(
  input: IssueInjectionGrantInput,
): Promise<IssueInjectionGrantResult> {
  return issueInjectionGrantWithAudit(input);
}

/**
 * Consumes a one-use Injection Grant and returns the decrypted value for runtime delivery only.
 */
export function consumeInjectionGrant(
  input: ConsumeInjectionGrantInput,
): Promise<ConsumeInjectionGrantResult> {
  return consumeInjectionGrantWithAudit(input);
}
