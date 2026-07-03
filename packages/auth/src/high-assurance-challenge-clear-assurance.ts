import {
  isHighAssuranceAuthenticationMethod,
  isInsufficientAssuranceAuthenticationMethod,
  isSmsAuthFactor,
  type WorkOSAuthFactorSummary,
} from "./mfa-posture.js";
import {
  evaluateSessionAssurance,
  type SessionAssuranceFailureReason,
} from "./session-assurance.js";

/** Factor types recorded when WorkOS/AuthKit step-up completes at challenge clear time. */
export type FreshStepUpFactorType = "totp" | "generic_otp" | "passkey";

export type HighAssuranceChallengeClearFailureReason =
  | SessionAssuranceFailureReason
  | "fresh_step_up_required";

export type HighAssuranceChallengeClearAssuranceResult =
  | { ok: true }
  | { ok: false; reason: HighAssuranceChallengeClearFailureReason };

export interface EvaluateHighAssuranceChallengeClearInput {
  readonly authenticationMethod?: string;
  readonly authFactors: readonly WorkOSAuthFactorSummary[];
  /**
   * Fresh factor verified at challenge clear time via WorkOS/AuthKit step-up on the
   * Human Approval Surface. Login-time MFA posture alone must not satisfy clear (ADR-0032).
   */
  readonly freshStepUpFactor?: FreshStepUpFactorType;
}

function hasFreshPasskeyStepUp(input: EvaluateHighAssuranceChallengeClearInput): boolean {
  return (
    isHighAssuranceAuthenticationMethod(input.authenticationMethod) ||
    input.freshStepUpFactor === "passkey"
  );
}

function hasFreshTotpStepUp(input: EvaluateHighAssuranceChallengeClearInput): boolean {
  return input.freshStepUpFactor === "totp" || input.freshStepUpFactor === "generic_otp";
}

function rejectBlockedSessionPosture(
  input: EvaluateHighAssuranceChallengeClearInput,
): HighAssuranceChallengeClearAssuranceResult | undefined {
  if (input.authFactors.some(isSmsAuthFactor)) {
    return { ok: false, reason: "sms_not_allowed" };
  }
  if (isInsufficientAssuranceAuthenticationMethod(input.authenticationMethod)) {
    return { ok: false, reason: "insufficient_assurance" };
  }
  return undefined;
}

/**
 * High-assurance challenge clear gate: requires fresh WorkOS/AuthKit step-up evidence at
 * challenge time. Production session assurance (password + enrolled TOTP) is insufficient.
 */
export function evaluateHighAssuranceChallengeClearAssurance(
  input: EvaluateHighAssuranceChallengeClearInput,
): HighAssuranceChallengeClearAssuranceResult {
  const blocked = rejectBlockedSessionPosture(input);
  if (blocked !== undefined) {
    return blocked;
  }

  if (hasFreshPasskeyStepUp(input) || hasFreshTotpStepUp(input)) {
    return { ok: true };
  }

  const sessionAssurance = evaluateSessionAssurance(input);
  if (!sessionAssurance.ok) {
    return sessionAssurance;
  }

  return { ok: false, reason: "fresh_step_up_required" };
}
