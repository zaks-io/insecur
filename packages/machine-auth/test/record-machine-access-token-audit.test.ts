import { AUTHORIZATION_SCOPES, CREDENTIAL_SCOPES } from "@insecur/access";
import { PRODUCTION_AUDIT_EVENT_CODES } from "@insecur/audit";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import {
  environmentId,
  machineAuthMethodId,
  machineIdentityId,
  operationId,
  organizationId,
  projectId,
  requestId,
  runtimePolicyId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  recordMachineAccessTokenDenied,
  recordMachineAccessTokenMinted,
  recordMachineAccessTokenUsed,
  recordMachineHumanOnlyGateDenied,
} from "../src/record-machine-access-token-audit.js";

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    writeAuditEvent: vi.fn().mockResolvedValue({ ok: true, auditEventId: "aud_TEST" }),
  };
});

import { writeAuditEvent } from "@insecur/audit";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const AUTH_METHOD = machineAuthMethodId.brand("mauth_00000000000000000000000004");
const POLICY_KEY = runtimePolicyId.brand("rp_00000000000000000000000001");
const REQ = requestId.brand("req_00000000000000000000000001");
const OP = operationId.brand("op_00000000000000000000000001");

describe("recordMachineAccessTokenAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records token minting with credential method and scope metadata only", async () => {
    await recordMachineAccessTokenMinted({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      machineIdentityId: MACHINE,
      credentialMethod: "environment_deploy_key",
      credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
      authMethodId: AUTH_METHOD,
      runtimePolicyKeyId: POLICY_KEY,
      expiresAtEpoch: 1_700_000_060,
      request: { requestId: REQ },
    });

    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: PRODUCTION_AUDIT_EVENT_CODES.machineAuthAccessTokenMinted,
        outcome: "success",
        actor: { type: "machine", machineIdentityId: MACHINE },
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        request: { requestId: REQ },
        details: expect.objectContaining({
          credentialMethod: "auth.credential_method.environment_deploy_key",
          credentialScopeCount: 1,
          authMethodId: AUTH_METHOD,
          runtimePolicyKeyId: POLICY_KEY,
          expiresAtEpoch: 1_700_000_060,
        }),
      }),
    );
    expect(JSON.stringify(vi.mocked(writeAuditEvent).mock.calls[0]?.[0])).not.toMatch(
      /secret|password|plaintext|oidc/i,
    );
  });

  it("records token use with request and operation correlation", async () => {
    await recordMachineAccessTokenUsed({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      machineIdentityId: MACHINE,
      credentialMethod: "github_actions_oidc",
      credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
      request: { requestId: REQ },
      operation: { operationId: OP },
    });

    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: PRODUCTION_AUDIT_EVENT_CODES.machineAuthAccessTokenUsed,
        outcome: "success",
        request: { requestId: REQ },
        operation: { operationId: OP },
      }),
    );
  });

  it("records token denial with stable denial metadata", async () => {
    await recordMachineAccessTokenDenied({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      machineIdentityId: MACHINE,
      credentialMethod: "environment_deploy_key",
      credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
      denialKind: "expired",
      request: { requestId: REQ },
    });

    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: PRODUCTION_AUDIT_EVENT_CODES.machineAuthAccessTokenDenied,
        outcome: "denied",
        denial: { reasonCode: AUTH_ERROR_CODES.expired },
        details: expect.objectContaining({
          machineAccessDenialKind: "auth.machine_access_denial.expired",
          credentialMethod: "auth.credential_method.environment_deploy_key",
        }),
      }),
    );
  });

  it("records human-only gate authorization denial for machine actors", async () => {
    await recordMachineHumanOnlyGateDenied({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      machineIdentityId: MACHINE,
      forbiddenScope: AUTHORIZATION_SCOPES.approvalApprove,
      credentialMethod: "github_actions_oidc",
      credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
      request: { requestId: REQ },
    });

    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: PRODUCTION_AUDIT_EVENT_CODES.machineAuthAuthorizationDenied,
        outcome: "denied",
        denial: { reasonCode: AUTH_ERROR_CODES.insufficientScope },
        details: expect.objectContaining({
          humanOnlyGate: "auth.human_only_gate.approval_approve",
          credentialMethod: "auth.credential_method.github_actions_oidc",
        }),
      }),
    );
  });
});
