import { AUTHORIZATION_SCOPES, type AuthorizationScope } from "./authorization-scopes.js";

/**
 * Authorization Scopes a machine credential must never hold alone.
 * @see docs/adr/0004-machine-identities-and-ci-auth.md
 */
export const MACHINE_FORBIDDEN_AUTHORIZATION_SCOPES = [
  AUTHORIZATION_SCOPES.approvalApprove,
  AUTHORIZATION_SCOPES.approvalReject,
  AUTHORIZATION_SCOPES.membershipManage,
  AUTHORIZATION_SCOPES.projectConfigure,
  AUTHORIZATION_SCOPES.onboardingGuidedProvision,
  AUTHORIZATION_SCOPES.metadataDetailRead,
  AUTHORIZATION_SCOPES.connectionManage,
  AUTHORIZATION_SCOPES.syncManage,
  AUTHORIZATION_SCOPES.deliveryPolicyManage,
] as const satisfies readonly AuthorizationScope[];

const MACHINE_FORBIDDEN_SCOPE_SET = new Set<string>(MACHINE_FORBIDDEN_AUTHORIZATION_SCOPES);

export function isMachineForbiddenAuthorizationScope(scope: string): boolean {
  return MACHINE_FORBIDDEN_SCOPE_SET.has(scope);
}

/** Removes scopes machines cannot exercise even when present on membership or credential grants. */
export function filterMachineForbiddenScopes(
  scopes: readonly AuthorizationScope[],
): readonly AuthorizationScope[] {
  return scopes.filter((scope) => !isMachineForbiddenAuthorizationScope(scope));
}
