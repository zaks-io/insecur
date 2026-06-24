import { organizationId, requestId, userId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordAdmissionDeniedAuditIfKnown } from "./record-admission-denied-audit.js";

vi.mock("@insecur/audit", () => ({
  recordAccessDeniedAudit: vi.fn(),
}));

vi.mock("@insecur/onboarding", () => ({
  loadInstanceAnchorOrganizationId: vi.fn(),
}));

vi.mock("@insecur/tenant-store", () => ({
  resolveActiveUserAdmission: vi.fn(),
  withTenantScope: vi.fn(),
}));

import { recordAccessDeniedAudit } from "@insecur/audit";
import { loadInstanceAnchorOrganizationId } from "@insecur/onboarding";
import { resolveActiveUserAdmission, withTenantScope } from "@insecur/tenant-store";

const mockedResolveActive = vi.mocked(resolveActiveUserAdmission);
const mockedWithTenantScope = vi.mocked(withTenantScope);
const mockedRecordDenied = vi.mocked(recordAccessDeniedAudit);
const mockedLoadAnchorOrg = vi.mocked(loadInstanceAnchorOrganizationId);

const instanceId = "inst_01JZ8E2QYQ6M7F4K9A2B3C4D5E";
const workosUserId = "user_01workos";
const reqId = requestId.brand("req_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const activeUser = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const revokedUser = "usr_01JZ8E2QYQ6M7F4K9A2B3C4D5F";
const anchorOrg = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");

describe("recordAdmissionDeniedAuditIfKnown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when admission is still active", async () => {
    mockedResolveActive.mockResolvedValueOnce({
      userId: activeUser,
      workosUserId,
      displayName: null,
    });

    await recordAdmissionDeniedAuditIfKnown({ instanceId, workosUserId, requestId: reqId });

    expect(mockedWithTenantScope).not.toHaveBeenCalled();
    expect(mockedRecordDenied).not.toHaveBeenCalled();
  });

  it("does nothing for unknown WorkOS subjects", async () => {
    mockedResolveActive.mockResolvedValueOnce(null);
    mockedWithTenantScope.mockImplementationOnce(async (_scope, run) => {
      const sql = vi.fn().mockResolvedValue([]);
      return await run({ sql } as never);
    });

    await recordAdmissionDeniedAuditIfKnown({ instanceId, workosUserId, requestId: reqId });

    expect(mockedRecordDenied).not.toHaveBeenCalled();
  });

  it("records access.denied for revoked admissions", async () => {
    mockedResolveActive.mockResolvedValueOnce(null);
    mockedWithTenantScope.mockImplementationOnce(async (_scope, run) => {
      const sql = vi.fn().mockResolvedValue([{ user_id: revokedUser }]);
      return await run({ sql } as never);
    });
    mockedLoadAnchorOrg.mockResolvedValueOnce(anchorOrg);

    await recordAdmissionDeniedAuditIfKnown({ instanceId, workosUserId, requestId: reqId });

    expect(mockedRecordDenied).toHaveBeenCalledWith({
      actor: { type: "user", userId: userId.brand(revokedUser) },
      organizationId: anchorOrg,
      reasonCode: "auth.required",
      request: { requestId: reqId },
    });
  });
});
