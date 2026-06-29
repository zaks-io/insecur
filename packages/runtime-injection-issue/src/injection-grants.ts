import type { ActorRef } from "@insecur/access";
import type { AuditOperationRef, AuditRequestRef } from "@insecur/audit";
import type { EnvironmentId, InjectionGrantId, OrganizationId, ProjectId } from "@insecur/domain";

import type { InjectionGrantIssueSelector } from "./injection-grant-selectors.js";
import { issueInjectionGrantWithAudit } from "./issue-injection-grant.js";

export interface IssueInjectionGrantInput {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  /** Exactly one Secret binding per grant (First Value: one `run --variable-key` or `--secret-id`). */
  selector: InjectionGrantIssueSelector;
  actor: ActorRef;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
}

export interface IssueInjectionGrantResult {
  grantId: InjectionGrantId;
  expiresAt: string;
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
