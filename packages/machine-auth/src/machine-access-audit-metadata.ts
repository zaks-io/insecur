import type { AuthorizationScope, CredentialScope } from "@insecur/access";
import type { AuditEventDetails } from "@insecur/audit";
import type { MachineAuthMethodId, RuntimePolicyId } from "@insecur/domain";

export type MachineCredentialMethod = "github_actions_oidc" | "environment_deploy_key";

export function machineCredentialMethodDetail(method: MachineCredentialMethod): AuditEventDetails {
  return { credentialMethod: `auth.credential_method.${method}` };
}

/** Maps Authorization Scope / Credential Scope atoms to audit-safe dotted metadata. */
export function authorizationScopeAuditAtom(scope: AuthorizationScope | CredentialScope): string {
  return `auth.scope_atom.${scope.replace(/:/g, "_")}`;
}

export function humanOnlyGateAuditDetail(scope: AuthorizationScope): AuditEventDetails {
  return { humanOnlyGate: `auth.human_only_gate.${scope.replace(/:/g, "_")}` };
}

export function machineAccessAuditDetails(input: {
  credentialMethod: MachineCredentialMethod;
  credentialScopes: readonly CredentialScope[];
  authMethodId?: MachineAuthMethodId;
  runtimePolicyKeyId?: RuntimePolicyId;
  requiredScopeAtom?: AuthorizationScope | CredentialScope;
}): AuditEventDetails {
  const details: Record<string, string | number> = {
    ...machineCredentialMethodDetail(input.credentialMethod),
    credentialScopeCount: input.credentialScopes.length,
  };

  if (input.authMethodId !== undefined) {
    details.authMethodId = input.authMethodId;
  }
  if (input.runtimePolicyKeyId !== undefined) {
    details.runtimePolicyKeyId = input.runtimePolicyKeyId;
  }
  if (input.requiredScopeAtom !== undefined) {
    details.requiredScopeAtom = authorizationScopeAuditAtom(input.requiredScopeAtom);
  }

  return details;
}
