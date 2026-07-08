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
    loadEnvironmentDeliveryImpactFacts: vi.fn(),
    loadPromotionDraftVersionImpactFacts: vi.fn(),
  };
});

vi.mock("../src/create-approval-request-with-audit.js", () => ({
  createApprovalRequestWithAudit: vi.fn(),
}));

vi.mock("../src/create-rollback-approval-request.js", () => ({
  persistRollbackApprovalRequestOnDb: vi.fn(),
}));

import {
  withTenantScope,
  copyRetainedSecretVersion,
  loadEnvironmentDeliveryImpactFacts,
  loadPromotionDraftVersionImpactFacts,
} from "@insecur/tenant-store";

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
const SOURCE_VERSION = secretVersionId.brand("sv_00000000000000000000000001");
const NEW_VERSION = secretVersionId.brand("sv_00000000000000000000000002");
const REQ = requestId.brand("req_00000000000000000000000001");
const APPROVAL = approvalRequestId.brand("req_00000000000000000000000002");

const ACTOR = { type: "user" as const, userId: USER };
const SCOPE = { organizationId: ORG, projectId: PROJECT, environmentId: ENV };

describe("rollback helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a draft version without approval when promote is not requested", async () => {
    const copied = {
      secretId: SECRET,
      secretVersionId: NEW_VERSION,
      versionNumber: 3,
      lifecycleState: "draft" as const,
    };
    vi.mocked(withTenantScope).mockImplementation(async (_scope, callback) =>
      callback({ db: {} as never }),
    );
    vi.mocked(copyRetainedSecretVersion).mockResolvedValue(copied);

    await expect(
      copyRollbackVersion({
        organizationId: ORG,
        secretId: SECRET,
        toSourceVersionId: SOURCE_VERSION,
        newSecretVersionId: NEW_VERSION,
        asDraft: true,
      }),
    ).resolves.toEqual(copied);
  });

  it("always persists protected rollback as draft when promote is not requested", async () => {
    const copied = {
      secretId: SECRET,
      secretVersionId: NEW_VERSION,
      versionNumber: 3,
      lifecycleState: "draft" as const,
    };
    vi.mocked(withTenantScope).mockImplementation(async (_scope, callback) =>
      callback({ db: {} as never }),
    );
    vi.mocked(copyRetainedSecretVersion).mockResolvedValue(copied);

    await expect(
      executeProtectedRollbackPersistence({
        input: {
          actor: ACTOR,
          organizationId: ORG,
          projectId: PROJECT,
          environmentId: ENV,
          secretId: SECRET,
          toVersionId: SOURCE_VERSION,
          promoteRequested: false,
          requestId: REQ,
        },
        scope: SCOPE,
        newSecretVersionId: NEW_VERSION,
      }),
    ).resolves.toMatchObject({
      lifecycleState: "draft",
    });

    expect(copyRetainedSecretVersion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        toSourceVersionId: SOURCE_VERSION,
        asDraft: true,
      }),
    );
  });

  it("creates rollback approval and copies draft version atomically when promote is requested", async () => {
    const copied = {
      secretId: SECRET,
      secretVersionId: NEW_VERSION,
      versionNumber: 4,
      lifecycleState: "draft" as const,
    };
    vi.mocked(withTenantScope).mockImplementation(async (_scope, callback) =>
      callback({ db: {} as never }),
    );
    vi.mocked(copyRetainedSecretVersion).mockResolvedValue(copied);
    vi.mocked(loadPromotionDraftVersionImpactFacts).mockResolvedValue([
      {
        secretId: SECRET,
        secretVersionId: NEW_VERSION,
        valueByteLength: 12,
        encodingClass: "utf8",
        secretShapeMatchVerdict: "match",
      },
    ]);
    vi.mocked(loadEnvironmentDeliveryImpactFacts).mockResolvedValue({
      runtimeInjectionPolicies: [],
      providerSyncImpact: [],
    });
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
          toVersionId: SOURCE_VERSION,
          promoteRequested: true,
          requestId: REQ,
          comment: "rollback",
        },
        scope: SCOPE,
        newSecretVersionId: NEW_VERSION,
      }),
    ).resolves.toMatchObject({
      approvalRequestId: APPROVAL,
      lifecycleState: "draft",
    });

    expect(persistRollbackApprovalRequestOnDb).toHaveBeenCalled();
  });
});
