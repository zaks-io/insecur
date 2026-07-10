import { recordActionAudit } from "@insecur/audit";
import {
  SECRET_ERROR_CODES,
  environmentId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  recordDeniedPossessionCheckAudit,
  recordPossessionCheckedAudit,
} from "../src/record-possession-check-audit.js";

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    recordActionAudit: vi.fn(async () => ({ auditEventId: "aud_test" })),
  };
});

const recordActionAuditMock = vi.mocked(recordActionAudit);

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const ACTOR = { type: "user" as const, userId: userId.brand("usr_00000000000000000000000001") };

const SCOPE = {
  actor: ACTOR,
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
};

describe("possession check audit recorders", () => {
  beforeEach(() => {
    recordActionAuditMock.mockClear();
  });

  it("records a denial under the possession-specific secret.possession_check_denied event code", async () => {
    await recordDeniedPossessionCheckAudit({
      ...SCOPE,
      reasonCode: SECRET_ERROR_CODES.coordinateInvalid,
    });

    expect(recordActionAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "denied",
        eventCode: "secret.possession_check_denied",
        reasonCode: SECRET_ERROR_CODES.coordinateInvalid,
      }),
    );
  });

  it("records a completed check with a dotted verdict detail code and no value-bearing fields", async () => {
    await recordPossessionCheckedAudit({ ...SCOPE, verdict: "mismatch" });

    expect(recordActionAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "success",
        eventCode: "secret.possession_checked",
        details: { verdict: "secret.possession_mismatch" },
      }),
    );
  });
});
