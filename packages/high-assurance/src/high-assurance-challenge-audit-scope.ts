import type { OperationHighAssuranceChallengeEvidence } from "@insecur/operations";
import type { ClearHighAssuranceChallengeInput } from "./high-assurance-challenge-inputs.js";
import { optionalAuditRequest } from "./optional-audit-request.js";

export function challengeAuditScopeFromBoundEvidence(
  input: {
    readonly organizationId: ClearHighAssuranceChallengeInput["organizationId"];
    readonly operationId: ClearHighAssuranceChallengeInput["operationId"];
    readonly request?: ClearHighAssuranceChallengeInput["request"];
  },
  evidence: OperationHighAssuranceChallengeEvidence,
) {
  return {
    organizationId: input.organizationId,
    projectId: evidence.projectId,
    operationId: input.operationId,
    ...(evidence.environmentId !== undefined ? { environmentId: evidence.environmentId } : {}),
    ...optionalAuditRequest(input.request),
  };
}

export function clearDeniedAuditScope(
  input: ClearHighAssuranceChallengeInput,
  boundEvidence?: OperationHighAssuranceChallengeEvidence,
) {
  const base = {
    organizationId: input.organizationId,
    operationId: input.operationId,
    clearingUserId: input.clearingUserId,
    ...optionalAuditRequest(input.request),
  };

  if (boundEvidence === undefined) {
    return base;
  }

  return {
    ...base,
    projectId: boundEvidence.projectId,
    ...(boundEvidence.environmentId !== undefined
      ? { environmentId: boundEvidence.environmentId }
      : {}),
  };
}
