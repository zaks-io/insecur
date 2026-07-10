import * as audit from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  environmentId,
  organizationId,
  projectId,
  secretId,
  secretSyncBindingId,
  secretSyncId,
  userId,
} from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  recordSecretSyncCreated,
  recordSecretSyncDisabled,
  recordSecretSyncUpdated,
  toBindingAuditDetails,
} from "../src/record-secret-sync-audit.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const SYNC = secretSyncId.brand("sync_00000000000000000000000001");
const BINDING = secretSyncBindingId.brand("sbind_00000000000000000000000001");
const BINDING_B = secretSyncBindingId.brand("sbind_00000000000000000000000002");
const BINDING_C = secretSyncBindingId.brand("sbind_00000000000000000000000003");
const SECRET = secretId.brand("sec_00000000000000000000000001");
const SECRET_B = secretId.brand("sec_00000000000000000000000002");
const SECRET_C = secretId.brand("sec_00000000000000000000000003");

const SCOPE = {
  actorUserId: USER,
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
};

/**
 * Runs the real write-time validation layer against every audited event so the
 * ADR-0068 metadata-safe guard is exercised, not mocked away (INS-592).
 */
function spyWriteAuditEventWithRealValidation() {
  return vi.spyOn(audit, "writeAuditEvent").mockImplementation(async (event) => {
    audit.validateAuditEventInput(event);
    return { auditEventId: "aud_test" };
  });
}

describe("recordSecretSync audit details", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes metadata-safe create audit details with opaque ids only", async () => {
    const writeSpy = spyWriteAuditEventWithRealValidation();

    await recordSecretSyncCreated({
      ...SCOPE,
      secretSyncId: SYNC,
      bindings: toBindingAuditDetails({ bindings: [{ id: BINDING, secretId: SECRET }] }),
    });

    expect(writeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: audit.PRODUCTION_AUDIT_EVENT_CODES.secretSyncCreated,
        outcome: "success",
        details: {
          bindingCount: 1,
          secretId1: SECRET,
          bindingId1: BINDING,
        },
      }),
    );
    const payload = writeSpy.mock.calls[0]?.[0];
    expect(JSON.stringify(payload)).not.toMatch(/DATABASE_URL|provider_destination/i);
  });

  it("passes the metadata-safe guard for multi-binding create with every binding identified", async () => {
    const writeSpy = spyWriteAuditEventWithRealValidation();
    const bindings = [
      { id: BINDING, secretId: SECRET },
      { id: BINDING_B, secretId: SECRET_B },
      { id: BINDING_C, secretId: SECRET_C },
    ];

    await recordSecretSyncCreated({
      ...SCOPE,
      secretSyncId: SYNC,
      bindings: toBindingAuditDetails({ bindings }),
    });

    const details = writeSpy.mock.calls[0]?.[0]?.details;
    expect(details).toBeDefined();
    expect(details?.bindingCount).toBe(bindings.length);
    bindings.forEach((binding, index) => {
      const ordinal = String(index + 1);
      expect(details?.[`secretId${ordinal}`]).toBe(binding.secretId);
      expect(details?.[`bindingId${ordinal}`]).toBe(binding.id);
    });
  });

  it("rejects the legacy comma-joined multi-binding shape at write time", () => {
    expect(() =>
      audit.validateAuditEventInput({
        eventCode: audit.PRODUCTION_AUDIT_EVENT_CODES.secretSyncCreated,
        outcome: "success",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        details: {
          bindingCount: 2,
          secretIdsCsv: `${SECRET},${SECRET_B}`,
          bindingIdsCsv: `${BINDING},${BINDING_B}`,
        },
      }),
    ).toThrow(audit.AuditEventValidationError);
  });

  it("writes binding metadata on update without provider destination names", async () => {
    const writeSpy = spyWriteAuditEventWithRealValidation();

    await recordSecretSyncUpdated({
      ...SCOPE,
      secretSyncId: SYNC,
      bindings: toBindingAuditDetails({
        bindings: [
          { id: BINDING, secretId: SECRET },
          { id: BINDING_B, secretId: SECRET_B },
        ],
      }),
    });

    expect(writeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: audit.PRODUCTION_AUDIT_EVENT_CODES.secretSyncUpdated,
        details: {
          bindingCount: 2,
          secretId1: SECRET,
          bindingId1: BINDING,
          secretId2: SECRET_B,
          bindingId2: BINDING_B,
        },
      }),
    );
  });

  it("writes disable success without sensitive metadata", async () => {
    const writeSpy = spyWriteAuditEventWithRealValidation();

    await recordSecretSyncDisabled({
      ...SCOPE,
      secretSyncId: SYNC,
    });

    expect(writeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: audit.PRODUCTION_AUDIT_EVENT_CODES.secretSyncDisabled,
        outcome: "success",
      }),
    );
    expect(writeSpy.mock.calls[0]?.[0]).not.toHaveProperty("details");
  });

  it("does not emit auth codes on success paths", async () => {
    const writeSpy = spyWriteAuditEventWithRealValidation();

    await recordSecretSyncCreated({
      ...SCOPE,
      secretSyncId: SYNC,
      bindings: toBindingAuditDetails({ bindings: [] }),
    });

    expect(writeSpy.mock.calls[0]?.[0]).not.toEqual(
      expect.objectContaining({ denial: { reasonCode: AUTH_ERROR_CODES.insufficientScope } }),
    );
  });
});
