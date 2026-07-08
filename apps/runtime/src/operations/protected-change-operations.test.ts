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

vi.mock("@insecur/protected-change", () => ({
  requestProtectedPromotion: vi.fn(),
  requestProtectedRollback: vi.fn(),
  listEnvironmentApprovals: vi.fn(),
}));

vi.mock("./metadata-operation-shared.js", () => ({
  assertUserOrganizationMembership: vi.fn().mockResolvedValue(undefined),
}));

import {
  listEnvironmentApprovals,
  requestProtectedPromotion,
  requestProtectedRollback,
} from "@insecur/protected-change";
import {
  listEnvironmentApprovalsOperation,
  requestProtectedPromotionOperation,
  requestProtectedRollbackOperation,
} from "./protected-change-operations.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const REQ = requestId.brand("req_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");
const DRAFT = secretVersionId.brand("sv_00000000000000000000000001");
const SOURCE_VERSION = secretVersionId.brand("sv_00000000000000000000000002");
const APPROVAL = approvalRequestId.brand("req_00000000000000000000000002");
const USER_ACTOR = { type: "user" as const, userId: USER };
const MACHINE_ACTOR = {
  type: "machine" as const,
  machineIdentityId: "mid_test" as never,
  tokenScope: { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
  credentialScopes: [],
};
const ACTOR_TOKEN = "test-actor-token";

describe("protected-change operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards promotion requests for machine actors", async () => {
    vi.mocked(requestProtectedPromotion).mockResolvedValue({
      approvalRequestId: APPROVAL,
      impactReviewFingerprint: "sha256:fp",
      supersededApprovalRequestIds: [],
      draftVersionIds: [DRAFT],
    });

    await expect(
      requestProtectedPromotionOperation({
        input: {
          actorToken: ACTOR_TOKEN,
          organizationId: ORG,
          projectId: PROJECT,
          environmentId: ENV,
          draftVersionIds: [DRAFT],
          requestId: REQ,
        },
        auditActor: { type: "user", userId: USER },
        accessActor: MACHINE_ACTOR,
      }),
    ).resolves.toMatchObject({ approvalRequestId: APPROVAL });

    expect(requestProtectedPromotion).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: MACHINE_ACTOR,
        draftVersionIds: [DRAFT],
      }),
    );
  });

  it("forwards promotion requests for user actors", async () => {
    vi.mocked(requestProtectedPromotion).mockResolvedValue({
      approvalRequestId: APPROVAL,
      impactReviewFingerprint: "sha256:fp",
      supersededApprovalRequestIds: [],
      draftVersionIds: [DRAFT],
    });

    await expect(
      requestProtectedPromotionOperation({
        input: {
          actorToken: ACTOR_TOKEN,
          organizationId: ORG,
          projectId: PROJECT,
          environmentId: ENV,
          draftVersionIds: [DRAFT],
          requestId: REQ,
          comment: "promote",
        },
        auditActor: { type: "user", userId: USER },
        accessActor: USER_ACTOR,
      }),
    ).resolves.toMatchObject({ approvalRequestId: APPROVAL });

    expect(requestProtectedPromotion).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: USER_ACTOR,
        draftVersionIds: [DRAFT],
        comment: "promote",
      }),
    );
  });

  it("forwards rollback requests for machine actors", async () => {
    vi.mocked(requestProtectedRollback).mockResolvedValue({
      secretId: SECRET,
      secretVersionId: DRAFT,
      versionNumber: 3,
      lifecycleState: "draft",
    });

    await expect(
      requestProtectedRollbackOperation({
        input: {
          actorToken: ACTOR_TOKEN,
          organizationId: ORG,
          projectId: PROJECT,
          environmentId: ENV,
          secretId: SECRET,
          toVersionId: SOURCE_VERSION,
          promoteRequested: true,
          requestId: REQ,
        },
        auditActor: { type: "user", userId: USER },
        accessActor: MACHINE_ACTOR,
      }),
    ).resolves.toMatchObject({ secretId: SECRET });

    expect(requestProtectedRollback).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: MACHINE_ACTOR,
        toVersionId: SOURCE_VERSION,
      }),
    );
  });

  it("forwards rollback requests for user actors", async () => {
    vi.mocked(requestProtectedRollback).mockResolvedValue({
      secretId: SECRET,
      secretVersionId: DRAFT,
      versionNumber: 3,
      lifecycleState: "draft",
    });

    await expect(
      requestProtectedRollbackOperation({
        input: {
          actorToken: ACTOR_TOKEN,
          organizationId: ORG,
          projectId: PROJECT,
          environmentId: ENV,
          secretId: SECRET,
          toVersionId: SOURCE_VERSION,
          promoteRequested: true,
          requestId: REQ,
        },
        auditActor: { type: "user", userId: USER },
        accessActor: USER_ACTOR,
      }),
    ).resolves.toMatchObject({ secretId: SECRET });

    expect(requestProtectedRollback).toHaveBeenCalled();
  });

  it("lists environment approvals for user actors", async () => {
    vi.mocked(listEnvironmentApprovals).mockResolvedValue([
      {
        approvalRequestId: APPROVAL,
        purpose: "protected_promotion",
        status: "pending",
        createdAt: "2026-07-08T00:00:00.000Z",
        operationId: null,
      },
    ]);

    await expect(
      listEnvironmentApprovalsOperation({
        input: {
          actorToken: ACTOR_TOKEN,
          organizationId: ORG,
          projectId: PROJECT,
          environmentId: ENV,
          requestId: REQ,
        },
        auditActor: { type: "user", userId: USER },
        accessActor: USER_ACTOR,
      }),
    ).resolves.toEqual({
      approvals: [
        {
          approvalRequestId: APPROVAL,
          purpose: "protected_promotion",
          status: "pending",
          createdAt: "2026-07-08T00:00:00.000Z",
          operationId: null,
        },
      ],
    });
  });
});
