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

/** Metadata-only enrollment marker set after AuthKit passkey enrollment (ADR-0052). */
export const APPROVAL_PASSKEY_ENROLLED_METADATA_KEY = "insecur_approval_passkey_enrolled";

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

/** Reads the AuthKit enrollment marker from WorkOS user metadata (not legacy MFA factor rows). */
export function parseApprovalPasskeyEnrolledMetadata(
  metadata: Record<string, string> | undefined,
): boolean {
  return metadata?.[APPROVAL_PASSKEY_ENROLLED_METADATA_KEY] === "true";
}

/**
 * Whether the human has an approval passkey enrolled for High-Assurance Challenge step-up.
 * AuthKit passkeys are not listed by WorkOS MFA factor APIs; posture uses session
 * authenticationMethod and the metadata marker recorded after enrollment (INS-378).
 */
export function hasApprovalPasskey(input: {
  readonly authenticationMethod?: string;
  readonly registeredPasskey?: boolean;
}): boolean {
  if (isHighAssuranceAuthenticationMethod(input.authenticationMethod)) {
    return true;
  }
  return input.registeredPasskey === true;
}
