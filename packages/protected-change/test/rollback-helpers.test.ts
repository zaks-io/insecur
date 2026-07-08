import {
  approvalRequestId,
  environmentId,
  organizationId,
  projectId,
  requestId,
  secretId,
  secretVersionId,
  userId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(),
    copyRetainedSecretVersion: vi.fn(),
  };
});

vi.mock("../src/create-approval-request-with-audit.js", () => ({
  createApprovalRequestWithAudit: vi.fn(),
}));

vi.mock("../src/create-rollback-approval-request.js", () => ({
  persistRollbackApprovalRequestOnDb: vi.fn(),
}));

import { withTenantScope, copyRetainedSecretVersion } from "@insecur/tenant-store";

import { createApprovalRequestWithAudit } from "../src/create-approval-request-with-audit.js";
import { persistRollbackApprovalRequestOnDb } from "../src/create-rollback-approval-request.js";
import {
  copyRollbackVersion,
  executeProtectedRollbackPersistence,
} from "../src/rollback-helpers.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");
const VERSION = secretVersionId.brand("sv_00000000000000000000000001");
const REQ = requestId.brand("req_00000000000000000000000001");
const APPROVAL = approvalRequestId.brand("req_00000000000000000000000002");

const ACTOR = { type: "user" as const, userId: USER };
const SCOPE = { organizationId: ORG, projectId: PROJECT, environmentId: ENV };

describe("rollback helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("copies rollback versions without approval when promote is not requested", async () => {
    const copied = {
      secretId: SECRET,
      secretVersionId: VERSION,
      versionNumber: 3,
      lifecycleState: "live" as const,
    };
    vi.mocked(withTenantScope).mockImplementation(async (_scope, callback) =>
      callback({ db: {} as never }),
    );
    vi.mocked(copyRetainedSecretVersion).mockResolvedValue(copied);

    await expect(
      copyRollbackVersion({
        organizationId: ORG,
        secretId: SECRET,
        toVersionNumber: 2,
        newSecretVersionId: VERSION,
        asDraft: false,
      }),
    ).resolves.toEqual(copied);
  });

  it("creates rollback approval and copies draft version atomically when promote is requested", async () => {
    const copied = {
      secretId: SECRET,
      secretVersionId: VERSION,
      versionNumber: 4,
      lifecycleState: "draft" as const,
    };
    vi.mocked(withTenantScope).mockImplementation(async (_scope, callback) =>
      callback({ db: {} as never }),
    );
    vi.mocked(copyRetainedSecretVersion).mockResolvedValue(copied);
    vi.mocked(persistRollbackApprovalRequestOnDb).mockResolvedValue(undefined);
    vi.mocked(createApprovalRequestWithAudit).mockImplementation(async ({ persist }) => {
      const created = APPROVAL;
      const result = await persist(created);
      return { approvalRequestId: created, result };
    });

    await expect(
      executeProtectedRollbackPersistence({
        input: {
          actor: ACTOR,
          organizationId: ORG,
          projectId: PROJECT,
          environmentId: ENV,
          secretId: SECRET,
          toVersionNumber: 2,
          promoteRequested: true,
          requestId: REQ,
          comment: "rollback",
        },
        scope: SCOPE,
        newSecretVersionId: VERSION,
      }),
    ).resolves.toMatchObject({
      approvalRequestId: APPROVAL,
      lifecycleState: "draft",
    });

    expect(persistRollbackApprovalRequestOnDb).toHaveBeenCalled();
  });
});
