import type { HighAssuranceErrorCode, KnownErrorCode } from "@insecur/domain";
import { HighAssuranceChallengeError } from "./high-assurance-challenge-error.js";
import type { ClearHighAssuranceChallengeInput } from "./high-assurance-challenge-inputs.js";
import { optionalAuditRequest } from "./optional-audit-request.js";
import { recordHighAssuranceChallengeClearDenied } from "./record-high-assurance-challenge-audit.js";

function clearChallengeDeniedAuditBase(input: ClearHighAssuranceChallengeInput) {
  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    operationId: input.operationId,
    clearingUserId: input.clearingUserId,
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
    ...optionalAuditRequest(input.request),
  };
}

export async function denyClearHighAssuranceChallenge(
  input: ClearHighAssuranceChallengeInput,
  throwCode: HighAssuranceErrorCode,
  message: string,
  options?: {
    readonly auditReasonCode?: KnownErrorCode;
    readonly riskReasonCode?: string;
  },
): Promise<never> {
  await recordHighAssuranceChallengeClearDenied({
    ...clearChallengeDeniedAuditBase(input),
    reasonCode: options?.auditReasonCode ?? throwCode,
    ...(options?.riskReasonCode !== undefined ? { riskReasonCode: options.riskReasonCode } : {}),
  });
  throw new HighAssuranceChallengeError(throwCode, message);
}
