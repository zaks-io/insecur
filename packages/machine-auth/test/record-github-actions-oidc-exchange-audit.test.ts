import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import {
  mapVerificationFailureToReasonCode,
  recordGitHubActionsOidcExchangeDenied,
  recordGitHubActionsOidcExchangeSuccess,
} from "../src/record-github-actions-oidc-exchange-audit.js";
import {
  environmentId,
  machineIdentityId,
  organizationId,
  projectId,
  requestId,
} from "@insecur/domain";
import { PRODUCTION_AUDIT_EVENT_CODES } from "@insecur/audit";

vi.mock("@insecur/audit", () => ({
  PRODUCTION_AUDIT_EVENT_CODES: {
    machineGithubActionsOidcExchanged: "machine.github_actions_oidc.exchanged",
    machineGithubActionsOidcExchangeDenied: "machine.github_actions_oidc.exchange_denied",
  },
  writeAuditEvent: vi.fn(),
}));

import { writeAuditEvent } from "@insecur/audit";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const REQ = requestId.brand("req_00000000000000000000000001");

describe("recordGitHubActionsOidcExchangeAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records successful exchanges with machine actor context", async () => {
    await recordGitHubActionsOidcExchangeSuccess({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      machineIdentityId: MACHINE,
      request: { requestId: REQ },
    });

    expect(writeAuditEvent).toHaveBeenCalledWith({
      eventCode: PRODUCTION_AUDIT_EVENT_CODES.machineGithubActionsOidcExchanged,
      outcome: "success",
      actor: { type: "machine", machineIdentityId: MACHINE },
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      resource: { type: "machine_identity", id: expect.any(String) },
      request: { requestId: REQ },
    });
  });

  it("records denied exchanges with ci_exchange actor when machine identity is unknown", async () => {
    await recordGitHubActionsOidcExchangeDenied({
      organizationId: ORG,
      reasonCode: AUTH_ERROR_CODES.invalid,
      oidcDenialKind: "malformed",
      request: { requestId: REQ },
    });

    expect(writeAuditEvent).toHaveBeenCalledWith({
      eventCode: PRODUCTION_AUDIT_EVENT_CODES.machineGithubActionsOidcExchangeDenied,
      outcome: "denied",
      actor: { type: "ci_exchange" },
      organizationId: ORG,
      denial: { reasonCode: AUTH_ERROR_CODES.invalid },
      details: { oidcDenialKind: "auth.oidc_denial.malformed" },
      request: { requestId: REQ },
    });
  });
});

describe("mapVerificationFailureToReasonCode", () => {
  it("maps expired verification failures to expired auth errors", () => {
    expect(mapVerificationFailureToReasonCode("expired")).toBe(AUTH_ERROR_CODES.expired);
  });

  it("maps malformed and invalid verification failures to invalid auth errors", () => {
    expect(mapVerificationFailureToReasonCode("malformed")).toBe(AUTH_ERROR_CODES.invalid);
    expect(mapVerificationFailureToReasonCode("invalid")).toBe(AUTH_ERROR_CODES.invalid);
  });
});
