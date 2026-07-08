import * as audit from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  environmentId,
  organizationId,
  projectId,
  runtimePolicyId,
  runtimePolicyVersionId,
  userId,
} from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  recordRuntimeInjectionPolicyCreated,
  recordRuntimeInjectionPolicyDisabled,
} from "../src/record-runtime-injection-policy-audit.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const POLICY = runtimePolicyId.brand("rp_00000000000000000000000010");
const VERSION = runtimePolicyVersionId.brand("rpv_00000000000000000000000001");

const SCOPE = {
  actorUserId: USER,
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
};

describe("recordRuntimeInjectionPolicy audit details", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes metadata-safe create audit details with opaque version id only", async () => {
    const writeSpy = vi
      .spyOn(audit, "writeAuditEvent")
      .mockResolvedValue({ auditEventId: "aud_test" });

    await recordRuntimeInjectionPolicyCreated({
      ...SCOPE,
      policyId: POLICY,
      policyVersionId: VERSION,
    });

    expect(writeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: audit.PRODUCTION_AUDIT_EVENT_CODES.runtimeInjectionPolicyCreated,
        outcome: "success",
        details: {
          policyVersionId: VERSION,
        },
      }),
    );
  });

  it("rejects free-form display names in create audit details", () => {
    expect(() => {
      audit.validateAuditEventInput({
        eventCode: audit.PRODUCTION_AUDIT_EVENT_CODES.runtimeInjectionPolicyCreated,
        outcome: "success",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        resource: { type: "runtime_injection_policy", id: POLICY },
        details: {
          policyVersionId: VERSION,
          displayName: "migration",
        },
      });
    }).toThrow(/stable dotted code or opaque resource ID/);
  });

  it("writes metadata-safe disable audit details with comment length only", async () => {
    const writeSpy = vi
      .spyOn(audit, "writeAuditEvent")
      .mockResolvedValue({ auditEventId: "aud_test" });

    await recordRuntimeInjectionPolicyDisabled({
      ...SCOPE,
      policyId: POLICY,
      comment: "retire migration flow",
    });

    expect(writeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: audit.PRODUCTION_AUDIT_EVENT_CODES.runtimeInjectionPolicyDisabled,
        outcome: "success",
        details: {
          commentLength: "retire migration flow".length,
        },
      }),
    );
  });

  it("rejects free-form comment strings in disable audit details", () => {
    expect(() => {
      audit.validateAuditEventInput({
        eventCode: audit.PRODUCTION_AUDIT_EVENT_CODES.runtimeInjectionPolicyDisabled,
        outcome: "success",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        resource: { type: "runtime_injection_policy", id: POLICY },
        details: {
          comment: "retire migration flow",
        },
      });
    }).toThrow(/stable dotted code or opaque resource ID/);
  });

  it("writes auth.insufficient_scope for denied disable audits", async () => {
    const writeSpy = vi.spyOn(audit, "writeAuditEvent").mockResolvedValue(undefined);

    const { recordRuntimeInjectionPolicyDisableDenied } =
      await import("../src/record-runtime-injection-policy-audit.js");

    await recordRuntimeInjectionPolicyDisableDenied({
      ...SCOPE,
      policyId: POLICY,
      reasonCode: AUTH_ERROR_CODES.insufficientScope,
    });

    expect(writeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: audit.PRODUCTION_AUDIT_EVENT_CODES.runtimeInjectionPolicyDisableDenied,
        outcome: "denied",
        denial: { reasonCode: AUTH_ERROR_CODES.insufficientScope },
      }),
    );
  });
});
