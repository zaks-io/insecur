import { randomBytes } from "node:crypto";
import {
  evaluateSessionAssurance,
  isHighAssuranceAuthenticationMethod,
  type EvaluateSessionAssuranceInput,
  type WorkOSAuthFactorSummary,
} from "@insecur/auth";
import type { HighAssuranceAuthenticationMethodCode } from "./high-assurance-risk-reason-codes.js";
import { HIGH_ASSURANCE_AUTHENTICATION_METHOD_CODES } from "./high-assurance-risk-reason-codes.js";

export function generateChallengeId(): string {
  return randomBytes(16).toString("hex");
}

export function mapSessionAssuranceToAuthenticationMethodCode(
  input: EvaluateSessionAssuranceInput,
): HighAssuranceAuthenticationMethodCode | null {
  const assurance = evaluateSessionAssurance(input);
  if (!assurance.ok) {
    return null;
  }
  if (isHighAssuranceAuthenticationMethod(input.authenticationMethod)) {
    return HIGH_ASSURANCE_AUTHENTICATION_METHOD_CODES.passkey;
  }
  if (
    input.authFactors.some(
      (factor: WorkOSAuthFactorSummary) => factor.type === "totp" || factor.type === "generic_otp",
    )
  ) {
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
