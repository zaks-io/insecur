import { FIRST_VALUE_AUDIT_EVENT_CODES, type AuditEventCode } from "@insecur/audit";
import type { PublicEdgeAbuseTarget } from "./public-edge-abuse-target.js";

export const DENIED_AUDIT_EVENT_BY_PUBLIC_EDGE_TARGET: Record<
  PublicEdgeAbuseTarget,
  AuditEventCode
> = {
  onboarding_guided_provision: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisionDenied,
  bootstrap_operator_claim: FIRST_VALUE_AUDIT_EVENT_CODES.bootstrapOperatorClaimDenied,
  auth_cli_pkce_exchange: FIRST_VALUE_AUDIT_EVENT_CODES.authCliPkceExchangeDenied,
  auth_cli_device_token: FIRST_VALUE_AUDIT_EVENT_CODES.authCliDeviceTokenDenied,
};
