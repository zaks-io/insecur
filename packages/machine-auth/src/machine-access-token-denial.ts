import type { AuditEventDetails } from "@insecur/audit";
import { AUTH_ERROR_CODES, type AuthErrorCode } from "@insecur/domain";

export type MachineAccessTokenDenialKind =
  | "expired"
  | "invalid"
  | "wrong_organization"
  | "wrong_project"
  | "wrong_environment"
  | "wrong_runtime_policy"
  | "insufficient_credential_scope";

export function machineAccessTokenDenialDetail(
  kind: MachineAccessTokenDenialKind,
): AuditEventDetails {
  return { machineAccessDenialKind: `auth.machine_access_denial.${kind}` };
}

export function machineAccessTokenDenialReasonCode(
  kind: MachineAccessTokenDenialKind,
): AuthErrorCode {
  switch (kind) {
    case "expired":
      return AUTH_ERROR_CODES.expired;
    case "insufficient_credential_scope":
      return AUTH_ERROR_CODES.insufficientScope;
    case "wrong_organization":
    case "wrong_project":
    case "wrong_environment":
    case "wrong_runtime_policy":
      return AUTH_ERROR_CODES.invalid;
    case "invalid":
      return AUTH_ERROR_CODES.invalid;
  }
}

export function machineAccessTokenDenialMessage(kind: MachineAccessTokenDenialKind): string {
  switch (kind) {
    case "expired":
      return "Machine access token has expired.";
    case "insufficient_credential_scope":
      return "Machine access token credential scopes are insufficient for this request.";
    case "wrong_organization":
      return "Machine access token organization does not match the request coordinate.";
    case "wrong_project":
      return "Machine access token project does not match the request coordinate.";
    case "wrong_environment":
      return "Machine access token environment does not match the request coordinate.";
    case "wrong_runtime_policy":
      return "Machine access token runtime policy does not match the request coordinate.";
    case "invalid":
      return "Machine access token is invalid.";
  }
}
