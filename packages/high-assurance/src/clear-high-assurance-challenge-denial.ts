import type { HighAssuranceErrorCode, KnownErrorCode } from "@insecur/domain";
import type { OperationHighAssuranceChallengeEvidence } from "@insecur/operations";
import type { ClearHighAssuranceChallengeInput } from "./high-assurance-challenge-inputs.js";
import { clearDeniedAuditScope } from "./high-assurance-challenge-audit-scope.js";
import { HighAssuranceChallengeError } from "./high-assurance-challenge-error.js";
import { recordHighAssuranceChallengeClearDenied } from "./record-high-assurance-challenge-audit.js";

export async function denyClearHighAssuranceChallenge(input: {
  readonly clearInput: ClearHighAssuranceChallengeInput;
  readonly boundEvidence?: OperationHighAssuranceChallengeEvidence;
  readonly throwCode: HighAssuranceErrorCode;
  readonly message: string;
  readonly auditReasonCode?: KnownErrorCode;
  readonly riskReasonCode?: string;
}): Promise<never> {
  await recordHighAssuranceChallengeClearDenied({
    ...clearDeniedAuditScope(input.clearInput, input.boundEvidence),
    reasonCode: input.auditReasonCode ?? input.throwCode,
    ...(input.riskReasonCode !== undefined ? { riskReasonCode: input.riskReasonCode } : {}),
  });
  throw new HighAssuranceChallengeError(input.throwCode, input.message);
}
