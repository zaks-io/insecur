import {
  hasEligibleEnrolledMfaFactor,
  isHighAssuranceAuthenticationMethod,
  isInsufficientAssuranceAuthenticationMethod,
  isSmsAuthFactor,
  type WorkOSAuthFactorSummary,
} from "./mfa-posture.js";

export type SessionAssuranceFailureReason =
  "sms_not_allowed" | "mfa_enrollment" | "insufficient_assurance";

export type SessionAssuranceResult =
  { ok: true } | { ok: false; reason: SessionAssuranceFailureReason };

export interface EvaluateSessionAssuranceInput {
  readonly authenticationMethod?: string;
  readonly authFactors: readonly WorkOSAuthFactorSummary[];
}

/**
 * Production session gate: eligible MFA enrollment, no SMS factors, and authentication
 * assurance appropriate for WorkOS AuthKit sessions (ADR-0009, ADR-0010).
 */
export function evaluateSessionAssurance(
  input: EvaluateSessionAssuranceInput,
): SessionAssuranceResult {
  if (input.authFactors.some(isSmsAuthFactor)) {
    return { ok: false, reason: "sms_not_allowed" };
  }

  if (isHighAssuranceAuthenticationMethod(input.authenticationMethod)) {
    return { ok: true };
  }

  if (isInsufficientAssuranceAuthenticationMethod(input.authenticationMethod)) {
    return { ok: false, reason: "insufficient_assurance" };
  }

  if (!hasEligibleEnrolledMfaFactor(input.authFactors)) {
    return { ok: false, reason: "mfa_enrollment" };
  }

  return { ok: true };
}
