import {
  CREDENTIAL_SCOPES,
  RUNTIME_INJECTION_CREDENTIAL_SCOPE_BUNDLE,
  type CredentialScope,
} from "@insecur/access";
import { isMachineForbiddenAuthorizationScope } from "@insecur/access";

/** Credential scopes an Environment Deploy Key may carry. */
export const DEPLOY_KEY_ALLOWED_CREDENTIAL_SCOPES = [
  ...RUNTIME_INJECTION_CREDENTIAL_SCOPE_BUNDLE,
] as const satisfies readonly CredentialScope[];

const DEPLOY_KEY_ALLOWED_SCOPE_SET = new Set<string>(DEPLOY_KEY_ALLOWED_CREDENTIAL_SCOPES);

export function isDeployKeyAllowedCredentialScope(value: string): value is CredentialScope {
  return DEPLOY_KEY_ALLOWED_SCOPE_SET.has(value);
}

export function collectDeployKeyOverbroadCredentialScopes(
  scopes: readonly string[],
): readonly string[] {
  const violations: string[] = [];
  for (const scope of scopes) {
    if (!isDeployKeyAllowedCredentialScope(scope)) {
      violations.push(scope);
      continue;
    }
    if (isMachineForbiddenAuthorizationScope(scope)) {
      violations.push(scope);
    }
  }
  return violations;
}

export function isDeployKeyCredentialScopeBundle(
  scopes: readonly CredentialScope[],
): scopes is readonly CredentialScope[] {
  if (scopes.length === 0) {
    return false;
  }
  return collectDeployKeyOverbroadCredentialScopes(scopes).length === 0;
}

export const DEPLOY_KEY_FORBIDDEN_EXAMPLE_SCOPES = [
  CREDENTIAL_SCOPES.secretNonProtectedWrite,
  CREDENTIAL_SCOPES.secretRead,
  CREDENTIAL_SCOPES.projectRead,
] as const;
