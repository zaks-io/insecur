import { AUTHORIZATION_SCOPES, CREDENTIAL_SCOPES } from "@insecur/access";
import { validateAuditEventInput } from "@insecur/audit";
import {
  machineAuthMethodId,
  machineIdentityId,
  organizationId,
  projectId,
  runtimePolicyId,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";
import {
  authorizationScopeAuditAtom,
  humanOnlyGateAuditDetail,
  machineAccessAuditDetails,
  machineCredentialMethodDetail,
} from "../src/machine-access-audit-metadata.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const AUTH_METHOD = machineAuthMethodId.brand("mauth_00000000000000000000000004");
const POLICY_KEY = runtimePolicyId.brand("rp_00000000000000000000000001");

describe("machine access audit metadata", () => {
  it("maps credential methods and scope atoms to audit-safe dotted codes", () => {
    expect(machineCredentialMethodDetail("github_actions_oidc")).toEqual({
      credentialMethod: "auth.credential_method.github_actions_oidc",
    });
    expect(authorizationScopeAuditAtom(CREDENTIAL_SCOPES.runtimeInjectionRun)).toBe(
      "auth.scope_atom.runtime_injection_run",
    );
    expect(humanOnlyGateAuditDetail(AUTHORIZATION_SCOPES.approvalApprove)).toEqual({
      humanOnlyGate: "auth.human_only_gate.approval_approve",
    });
  });

  it("builds metadata-only machine access audit details without secret material", () => {
    const details = machineAccessAuditDetails({
      credentialMethod: "environment_deploy_key",
      credentialScopes: [
        CREDENTIAL_SCOPES.runtimeInjectionRun,
        CREDENTIAL_SCOPES.runtimeInjectionGrantIssue,
      ],
      authMethodId: AUTH_METHOD,
      runtimePolicyKeyId: POLICY_KEY,
      requiredScopeAtom: CREDENTIAL_SCOPES.runtimeInjectionGrantIssueProtected,
    });

    expect(details).toEqual({
      credentialMethod: "auth.credential_method.environment_deploy_key",
      credentialScopeCount: 2,
      authMethodId: AUTH_METHOD,
      runtimePolicyKeyId: POLICY_KEY,
      requiredScopeAtom: "auth.scope_atom.runtime_injection_grant_issue_protected",
    });
    expect(JSON.stringify(details)).not.toMatch(/secret|token|password|plaintext/i);
  });

  it("passes machine access audit metadata through the audit allowlist", () => {
    expect(() => {
      validateAuditEventInput({
        eventCode: "machine_auth.access_token_minted",
        outcome: "success",
        actor: { type: "machine", machineIdentityId: MACHINE },
        organizationId: ORG,
        projectId: PROJECT,
        details: machineAccessAuditDetails({
          credentialMethod: "github_actions_oidc",
          credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
        }),
      });
    }).not.toThrow();

    expect(() => {
      validateAuditEventInput({
        eventCode: "machine_auth.access_token_denied",
        outcome: "denied",
        actor: { type: "machine", machineIdentityId: MACHINE },
        organizationId: ORG,
        denial: { reasonCode: "auth.expired" },
        details: {
          machineAccessDenialKind: "auth.machine_access_denial.expired",
          ...machineAccessAuditDetails({
            credentialMethod: "environment_deploy_key",
            credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
            authMethodId: AUTH_METHOD,
          }),
        },
      });
    }).not.toThrow();

    expect(() => {
      validateAuditEventInput({
        eventCode: "machine_auth.authorization_denied",
        outcome: "denied",
        actor: { type: "machine", machineIdentityId: MACHINE },
        organizationId: ORG,
        denial: { reasonCode: "auth.insufficient_scope" },
        details: humanOnlyGateAuditDetail(AUTHORIZATION_SCOPES.approvalApprove),
      });
    }).not.toThrow();
  });

  it("rejects secret-bearing keys in machine access audit metadata", () => {
    expect(() => {
      validateAuditEventInput({
        eventCode: "machine_auth.access_token_used",
        outcome: "success",
        actor: { type: "machine", machineIdentityId: MACHINE },
        organizationId: ORG,
        token: "must-not-appear",
      } as never);
    }).toThrow(/forbidden key: token/);
  });
});
