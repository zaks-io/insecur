/** WorkOS user-management authentication factor types we accept for MFA posture. */
export type WorkOSAuthFactorType = "totp" | "generic_otp" | "sms" | (string & {});

export interface WorkOSAuthFactorSummary {
  readonly type: WorkOSAuthFactorType;
}

/** WorkOS AuthKit authentication methods that satisfy production session assurance on their own. */
export const HIGH_ASSURANCE_AUTHENTICATION_METHODS = new Set<string>(["Passkey"]);

/**
 * Methods that never satisfy production session assurance, even when eligible MFA factors exist.
 * Magic link and impersonation must not back API sessions for custody workloads.
 */
export const INSUFFICIENT_ASSURANCE_AUTHENTICATION_METHODS = new Set<string>([
  "MagicAuth",
  "Impersonation",
]);

export function isSmsAuthFactor(factor: WorkOSAuthFactorSummary): boolean {
  return factor.type === "sms";
}

export function hasEligibleEnrolledMfaFactor(factors: readonly WorkOSAuthFactorSummary[]): boolean {
  return factors.some((factor) => factor.type === "totp" || factor.type === "generic_otp");
}

export function isHighAssuranceAuthenticationMethod(
  authenticationMethod: string | undefined,
): boolean {
  return (
    authenticationMethod !== undefined &&
    HIGH_ASSURANCE_AUTHENTICATION_METHODS.has(authenticationMethod)
  );
}

export function isInsufficientAssuranceAuthenticationMethod(
  authenticationMethod: string | undefined,
): boolean {
  return (
    authenticationMethod !== undefined &&
    INSUFFICIENT_ASSURANCE_AUTHENTICATION_METHODS.has(authenticationMethod)
  );
}
