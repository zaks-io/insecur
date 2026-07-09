import {
  approvalRequestId,
  environmentId,
  machineIdentityId,
  organizationId,
  projectId,
  secretId,
  secretVersionId,
  userId,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { TenantApprovalRequestStore } from "../src/approvals/tenant-approval-request-store.js";
import { createMockTenantDb } from "./helpers/mock-tenant-db.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const REQUEST = approvalRequestId.brand("apr_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");
const DRAFT = secretVersionId.brand("sv_00000000000000000000000001");
const TO_VERSION = secretVersionId.brand("sv_00000000000000000000000002");
const NOW = new Date("2026-07-08T00:00:00.000Z");

describe("TenantApprovalRequestStore", () => {
  it("returns an empty list when superseding with no pending promotion", async () => {
    const { db } = createMockTenantDb({ selectResults: [[]] });
    const store = new TenantApprovalRequestStore(db);

    await expect(
      store.supersedePendingPromotionRequests({
        organizationId: ORG,
        environmentId: ENV,
        supersededByRequestId: REQUEST,
      }),
    ).resolves.toEqual([]);
  });

  it("lists environment approval requests with metadata only", async () => {
    const { db } = createMockTenantDb({
      selectResults: [
        [
          {
            id: REQUEST,
            purpose: "protected_promotion",
            status: "pending",
            createdAt: NOW,
            operationId: "op_00000000000000000000000001",
          },
        ],
      ],
    });
    const store = new TenantApprovalRequestStore(db);

    const rows = await store.listEnvironmentApprovalRequests({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
    });

    expect(rows).toEqual([
      {
        approvalRequestId: REQUEST,
        purpose: "protected_promotion",
        status: "pending",
        createdAt: NOW,
        operationId: "op_00000000000000000000000001",
      },
    ]);
  });

  it("supersedes pending promotion requests", async () => {
    const pendingId = approvalRequestId.brand("apr_00000000000000000000000002");
    const { db, updateSets } = createMockTenantDb({
      selectResults: [[{ id: pendingId }]],
    });
    const store = new TenantApprovalRequestStore(db);

    const superseded = await store.supersedePendingPromotionRequests({
      organizationId: ORG,
      environmentId: ENV,
      supersededByRequestId: REQUEST,
    });

    expect(superseded).toEqual([pendingId]);
    expect(updateSets[0]).toMatchObject({ status: "superseded", supersededByRequestId: REQUEST });
  });

  it("creates a promotion approval request and draft version rows", async () => {
    const { db, insertValues } = createMockTenantDb({
      selectResults: [[]],
    });
    const store = new TenantApprovalRequestStore(db);

    await store.createPromotionApprovalRequest({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      requester: { userId: USER },
      approvalRequestId: REQUEST,
      impactReviewFingerprint: "sha256:impact",
      draftVersions: [{ secretId: SECRET, secretVersionId: DRAFT }],
    });

    expect(insertValues.length).toBeGreaterThanOrEqual(2);
    expect(insertValues[0]).toMatchObject({
      id: REQUEST,
      purpose: "protected_promotion",
      status: "pending",
      requesterUserId: USER,
      requesterMachineIdentityId: null,
    });
  });

  it("binds a machine requester when an Agent creates a promotion request", async () => {
    const { db, insertValues } = createMockTenantDb({ selectResults: [[]] });
    const store = new TenantApprovalRequestStore(db);

    await store.createPromotionApprovalRequest({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      requester: { machineIdentityId: MACHINE },
      approvalRequestId: REQUEST,
      impactReviewFingerprint: "sha256:impact",
      draftVersions: [{ secretId: SECRET, secretVersionId: DRAFT }],
    });

    expect(insertValues[0]).toMatchObject({
      requesterUserId: null,
      requesterMachineIdentityId: MACHINE,
    });
  });

  it("creates a rollback approval request and draft version row", async () => {
    const { db, insertValues } = createMockTenantDb({ selectResults: [[]] });
    const store = new TenantApprovalRequestStore(db);

    await store.createRollbackApprovalRequest({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      requester: { userId: USER },
      approvalRequestId: REQUEST,
      impactReviewFingerprint: "sha256:impact",
      secretId: SECRET,
      toVersionId: TO_VERSION,
      promoteRequested: true,
      draftVersion: { secretId: SECRET, secretVersionId: DRAFT },
    });

    expect(insertValues[0]).toMatchObject({
      id: REQUEST,
      purpose: "protected_rollback",
      rollbackToVersionId: TO_VERSION,
      rollbackPromoteRequested: true,
    });
  });

  it("closes pending approval requests whose change set includes the discarded draft", async () => {
    const { db, updateSets, updateWheres } = createMockTenantDb({
      selectResults: [[{ id: REQUEST }]],
    });
    const store = new TenantApprovalRequestStore(db);

    const closed = await store.closePendingApprovalRequestsForDiscardedDraftVersion({
      organizationId: ORG,
      secretVersionId: DRAFT,
    });

    expect(closed).toEqual([REQUEST]);
    expect(updateSets[0]).toMatchObject({ status: "draft_discard_closed" });
    expect(updateWheres).toHaveLength(1);
  });

  it("returns no closed requests when nothing pending references the draft", async () => {
    const { db, updateSets } = createMockTenantDb({ selectResults: [[]] });
    const store = new TenantApprovalRequestStore(db);

    const closed = await store.closePendingApprovalRequestsForDiscardedDraftVersion({
      organizationId: ORG,
      secretVersionId: DRAFT,
    });

    expect(closed).toEqual([]);
    expect(updateSets).toHaveLength(0);
  });
});
