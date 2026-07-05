import { AUTHORIZATION_SCOPES } from "./authorization-scopes.js";

/**
 * Authorization Scopes that may appear on machine credentials for deploy and Runtime Injection.
 * @see docs/adr/0004-machine-identities-and-ci-auth.md
 */
export const CREDENTIAL_SCOPES = {
  runtimeInjectionRun: AUTHORIZATION_SCOPES.runtimeInjectionRun,
  runtimeInjectionGrantIssue: AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue,
  runtimeInjectionGrantIssueProtected: AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected,
  runtimeInjectionGrantConsume: AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume,
  secretNonProtectedWrite: AUTHORIZATION_SCOPES.secretNonProtectedWrite,
  secretRead: AUTHORIZATION_SCOPES.secretRead,
  projectRead: AUTHORIZATION_SCOPES.projectRead,
  environmentRead: AUTHORIZATION_SCOPES.environmentRead,
} as const;

export type CredentialScope = (typeof CREDENTIAL_SCOPES)[keyof typeof CREDENTIAL_SCOPES];

const CREDENTIAL_SCOPE_SET = new Set<string>(Object.values(CREDENTIAL_SCOPES));

export function isCredentialScope(value: string): value is CredentialScope {
  return CREDENTIAL_SCOPE_SET.has(value);
}

/** Typical deploy-key and CI Runtime Injection credential bundle. */
export const RUNTIME_INJECTION_CREDENTIAL_SCOPE_BUNDLE = [
  CREDENTIAL_SCOPES.runtimeInjectionRun,
  CREDENTIAL_SCOPES.runtimeInjectionGrantIssue,
  CREDENTIAL_SCOPES.runtimeInjectionGrantIssueProtected,
  CREDENTIAL_SCOPES.runtimeInjectionGrantConsume,
] as const satisfies readonly CredentialScope[];

/** Blind Secret Write plus Runtime Injection for automation that stages drafts. */
export const DEPLOY_AUTOMATION_CREDENTIAL_SCOPE_BUNDLE = [
  ...RUNTIME_INJECTION_CREDENTIAL_SCOPE_BUNDLE,
  CREDENTIAL_SCOPES.secretNonProtectedWrite,
] as const satisfies readonly CredentialScope[];
