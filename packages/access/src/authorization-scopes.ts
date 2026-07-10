/**
 * Coordinate-bound Authorization Scope atoms (`resource:verb`).
 * @see docs/adr/0034-effective-access-resolver.md
 */
export const AUTHORIZATION_SCOPES = {
  onboardingGuidedProvision: "onboarding:guided_organization_provision",
  secretNonProtectedWrite: "secret:non_protected_write",
  secretProtectedDraftWrite: "secret:protected_draft_write",
  runtimeInjectionGrantIssue: "runtime_injection:grant_issue",
  runtimeInjectionGrantIssueProtected: "runtime_injection:grant_issue_protected",
  runtimeInjectionGrantConsume: "runtime_injection:grant_consume",
  runtimeInjectionRun: "runtime_injection:run",
  operationCancel: "operation:cancel",
  organizationRead: "organization:read",
  projectRead: "project:read",
  environmentRead: "environment:read",
  secretRead: "secret:read",
  metadataDetailRead: "metadata:detail_read",
  approvalApprove: "approval:approve",
  approvalReject: "approval:reject",
  membershipManage: "membership:manage",
  projectConfigure: "project:configure",
  connectionRead: "connection:read",
  connectionManage: "connection:manage",
  syncRead: "sync:read",
  syncManage: "sync:manage",
  syncRun: "sync:run",
  webhookRead: "webhook:read",
  webhookManage: "webhook:manage",
} as const;

export type AuthorizationScope = (typeof AUTHORIZATION_SCOPES)[keyof typeof AUTHORIZATION_SCOPES];

const AUTHORIZATION_SCOPE_SET = new Set<string>(Object.values(AUTHORIZATION_SCOPES));

export function isAuthorizationScope(value: string): value is AuthorizationScope {
  return AUTHORIZATION_SCOPE_SET.has(value);
}

/** First Value owner onboarding, secret write, and runtime injection scopes. */
export const FIRST_VALUE_OWNER_SCOPES = [
  AUTHORIZATION_SCOPES.onboardingGuidedProvision,
  AUTHORIZATION_SCOPES.secretNonProtectedWrite,
  AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue,
  AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume,
  AUTHORIZATION_SCOPES.runtimeInjectionRun,
] as const satisfies readonly AuthorizationScope[];
