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
} from "../src/record-secret-sync-audit.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const SYNC = secretSyncId.brand("sync_00000000000000000000000001");
const BINDING = secretSyncBindingId.brand("sbind_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");

const SCOPE = {
  actorUserId: USER,
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
};

describe("recordSecretSync audit details", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes metadata-safe create audit details with opaque ids only", async () => {
    const writeSpy = vi
      .spyOn(audit, "writeAuditEvent")
      .mockResolvedValue({ auditEventId: "aud_test" });

    await recordSecretSyncCreated({
      ...SCOPE,
      secretSyncId: SYNC,
      bindings: {
        bindingCount: 1,
        secretIdsCsv: SECRET,
        bindingIdsCsv: BINDING,
      },
    });

    expect(writeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: audit.PRODUCTION_AUDIT_EVENT_CODES.secretSyncCreated,
        outcome: "success",
        details: {
          bindingCount: 1,
          secretIdsCsv: SECRET,
          bindingIdsCsv: BINDING,
        },
      }),
    );
    const payload = writeSpy.mock.calls[0]?.[0];
    expect(JSON.stringify(payload)).not.toMatch(/DATABASE_URL|provider_destination/i);
  });

  it("writes binding metadata on update without provider destination names", async () => {
    const writeSpy = vi
      .spyOn(audit, "writeAuditEvent")
      .mockResolvedValue({ auditEventId: "aud_test" });

    await recordSecretSyncUpdated({
      ...SCOPE,
      secretSyncId: SYNC,
      bindings: {
        bindingCount: 1,
        secretIdsCsv: SECRET,
        bindingIdsCsv: BINDING,
      },
    });

    expect(writeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: audit.PRODUCTION_AUDIT_EVENT_CODES.secretSyncUpdated,
        details: {
          bindingCount: 1,
          secretIdsCsv: SECRET,
          bindingIdsCsv: BINDING,
        },
      }),
    );
  });

  it("writes disable success without sensitive metadata", async () => {
    const writeSpy = vi
      .spyOn(audit, "writeAuditEvent")
      .mockResolvedValue({ auditEventId: "aud_test" });

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
    const writeSpy = vi
      .spyOn(audit, "writeAuditEvent")
      .mockResolvedValue({ auditEventId: "aud_test" });

    await recordSecretSyncCreated({
      ...SCOPE,
      secretSyncId: SYNC,
      bindings: {
        bindingCount: 0,
        secretIdsCsv: "",
        bindingIdsCsv: "",
      },
    });

    expect(writeSpy.mock.calls[0]?.[0]).not.toEqual(
      expect.objectContaining({ denial: { reasonCode: AUTH_ERROR_CODES.insufficientScope } }),
    );
  });
});
