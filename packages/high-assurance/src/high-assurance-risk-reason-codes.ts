/**
 * Canonical risk-reason codes for operation-bound High-Assurance Challenges (ADR-0068 shape).
 * One code names exactly one gated action class.
 */
export const HIGH_ASSURANCE_RISK_REASON_CODES = {
  protectedPromotion: "high_assurance.risk.protected_promotion",
  protectedRollback: "high_assurance.risk.protected_rollback",
  protectedDeliveryConfiguration: "high_assurance.risk.protected_delivery_configuration",
  protectedSecretSync: "high_assurance.risk.protected_secret_sync",
  protectedRuntimeInjectionPolicy: "high_assurance.risk.protected_runtime_injection_policy",
  appConnectionChange: "high_assurance.risk.app_connection_change",
  sensitiveDetailGate: "high_assurance.risk.sensitive_detail_gate",
  agentStepUp: "high_assurance.risk.agent_step_up",
} as const;

export type HighAssuranceRiskReasonCode =
  (typeof HIGH_ASSURANCE_RISK_REASON_CODES)[keyof typeof HIGH_ASSURANCE_RISK_REASON_CODES];

const HIGH_ASSURANCE_RISK_REASON_CODE_SET = new Set<string>(
  Object.values(HIGH_ASSURANCE_RISK_REASON_CODES),
);

export function isHighAssuranceRiskReasonCode(value: string): value is HighAssuranceRiskReasonCode {
  return HIGH_ASSURANCE_RISK_REASON_CODE_SET.has(value);
}

/** Metadata-safe assurance method codes recorded on cleared challenge evidence. */
export const HIGH_ASSURANCE_AUTHENTICATION_METHOD_CODES = {
  passkey: "auth.assurance.passkey",
  totp: "auth.assurance.totp",
} as const;

export type HighAssuranceAuthenticationMethodCode =
  (typeof HIGH_ASSURANCE_AUTHENTICATION_METHOD_CODES)[keyof typeof HIGH_ASSURANCE_AUTHENTICATION_METHOD_CODES];
