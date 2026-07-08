import type { AuditEventDetails } from "@insecur/audit";
import { AUTH_ERROR_CODES, type AuthErrorCode } from "@insecur/domain";

export type MachineAccessTokenDenialKind =
  | "expired"
  | "invalid"
  | "reuse"
  | "wrong_organization"
  | "wrong_project"
  | "wrong_environment"
  | "wrong_runtime_policy"
  | "insufficient_credential_scope";

const INVALID_MACHINE_ACCESS_TOKEN_DENIAL_KINDS = new Set<MachineAccessTokenDenialKind>([
  "invalid",
  "reuse",
  "wrong_organization",
  "wrong_project",
  "wrong_environment",
  "wrong_runtime_policy",
]);

const MACHINE_ACCESS_TOKEN_DENIAL_MESSAGES: Record<MachineAccessTokenDenialKind, string> = {
  expired: "Machine access token has expired.",
  reuse: "Machine access token reuse is not permitted.",
  insufficient_credential_scope:
    "Machine access token credential scopes are insufficient for this request.",
  wrong_organization: "Machine access token organization does not match the request coordinate.",
  wrong_project: "Machine access token project does not match the request coordinate.",
  wrong_environment: "Machine access token environment does not match the request coordinate.",
  wrong_runtime_policy:
    "Machine access token runtime policy does not match the request coordinate.",
  invalid: "Machine access token is invalid.",
};

export function machineAccessTokenDenialDetail(
  kind: MachineAccessTokenDenialKind,
): AuditEventDetails {
  return { machineAccessDenialKind: `auth.machine_access_denial.${kind}` };
}

export function machineAccessTokenDenialReasonCode(
  kind: MachineAccessTokenDenialKind,
): AuthErrorCode {
  if (kind === "expired") {
    return AUTH_ERROR_CODES.expired;
  }
  if (kind === "insufficient_credential_scope") {
    return AUTH_ERROR_CODES.insufficientScope;
  }
  if (INVALID_MACHINE_ACCESS_TOKEN_DENIAL_KINDS.has(kind)) {
    return AUTH_ERROR_CODES.invalid;
  }
  return AUTH_ERROR_CODES.invalid;
}

export function machineAccessTokenDenialMessage(kind: MachineAccessTokenDenialKind): string {
  return MACHINE_ACCESS_TOKEN_DENIAL_MESSAGES[kind];
}
