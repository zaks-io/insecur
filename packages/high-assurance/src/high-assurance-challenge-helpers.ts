import { randomBytes } from "node:crypto";
import {
  evaluateHighAssuranceChallengeClearAssurance,
  isHighAssuranceAuthenticationMethod,
  type EvaluateHighAssuranceChallengeClearInput,
} from "@insecur/auth";
import type { HighAssuranceAuthenticationMethodCode } from "./high-assurance-risk-reason-codes.js";
import { HIGH_ASSURANCE_AUTHENTICATION_METHOD_CODES } from "./high-assurance-risk-reason-codes.js";

export function generateChallengeId(): string {
  return randomBytes(16).toString("hex");
}

export function mapSessionAssuranceToAuthenticationMethodCode(
  input: EvaluateHighAssuranceChallengeClearInput,
): HighAssuranceAuthenticationMethodCode | null {
  const assurance = evaluateHighAssuranceChallengeClearAssurance(input);
  if (!assurance.ok) {
    return null;
  }

  if (
    isHighAssuranceAuthenticationMethod(input.authenticationMethod) ||
    input.freshStepUpFactor === "passkey"
  ) {
    return HIGH_ASSURANCE_AUTHENTICATION_METHOD_CODES.passkey;
  }

  if (input.freshStepUpFactor === "totp" || input.freshStepUpFactor === "generic_otp") {
    return HIGH_ASSURANCE_AUTHENTICATION_METHOD_CODES.totp;
  }

  return null;
}

export function isChallengeEvidenceExpired(expiresAt: string, now: Date): boolean {
  return Date.parse(expiresAt) <= now.getTime();
}

export function computeChallengeExpiresAt(requestedAt: Date, ttlSeconds: number): string {
  return new Date(requestedAt.getTime() + ttlSeconds * 1000).toISOString();
}
