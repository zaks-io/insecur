import { PRODUCTION_AUDIT_EVENT_CODES } from "@insecur/audit";
import { AUTHORIZATION_SCOPES, expandBuiltInRolePresetToScopes } from "@insecur/access";
import {
  auditEventId,
  ENVIRONMENT_LIFECYCLE_STAGES,
  environmentId,
  machineIdentityId,
  operationId,
  organizationId,
  parseDisplayName,
  projectId,
  requestId,
  userId,
  type DisplayName,
} from "@insecur/domain";
import {
  closeRuntimeSql,
  TenantEnvironmentLifecycleStore,
  withTenantScope,
} from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  approveProtectedChange,
  cancelProtectedChange,
  createProtectedChange,
  generateApprovalEvidenceId,
  generateProtectedChangeId,
  rejectProtectedChange,
  submitProtectedChangeForApproval,
  closeProtectedChangeStale,
  ProtectedChangeError,
  beginProtectedChangeExecution,
  completeProtectedChangeExecution,
  PROTECTED_CHANGE_STATE_CODES,
} from "../src/index.js";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const ORG = organizationId.brand(TEST_ORG_A_ID);
const PROJECT = projectId.brand(TEST_PROJECT_A_ID);
const REQUESTER = userId.brand(TEST_USER_ID);
const APPROVER = REQUESTER;
const DRAFT_VERSION_ID = "sv_00000000000000000000000099";

const TEST_MACHINE_ID = "mach_00000000000000000000000082";
const TEST_MACHINE_MEM_ID = "mem_00000000000000000000000082";

const TEST_ENV_IDS = {
  create: "env_00000000000000000000000082",
  deniedTransition: "env_00000000000000000000000083",
  fullFlow: "env_00000000000000000000000084",
  machineRequester: "env_00000000000000000000000085",
} as const;

function testDisplayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`invalid fixture display name: ${raw}`);
  }
  return parsed.value;
}

async function cleanupProtectedChanges(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ sql }) => {
    await sql`DELETE FROM protected_change_approval_evidence WHERE org_id = ${ORG}`;
    await sql`DELETE FROM protected_changes WHERE org_id = ${ORG}`;
    for (const envId of Object.values(TEST_ENV_IDS)) {
      await sql`DELETE FROM environments WHERE id = ${envId}`;
    }
    await sql`DELETE FROM machine_identity_memberships WHERE id = ${TEST_MACHINE_MEM_ID}`;
    await sql`DELETE FROM machine_identities WHERE id = ${TEST_MACHINE_ID}`;
  });
}

async function ensureProtectedEnvironment(envId: string, displayName: string): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ db }) => {
    const store = new TenantEnvironmentLifecycleStore(db);
    const brandedEnvId = environmentId.brand(envId);
    const existing = await store.getById(ORG, brandedEnvId);
    if (existing) {
      return;
    }
    await store.create({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: brandedEnvId,
      displayName: testDisplayName(displayName),
      lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.preview,
    });
  });
}

async function seedMachineRequester(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ sql }) => {
    await sql`
      INSERT INTO machine_identities (id, org_id, display_name)
      VALUES (${TEST_MACHINE_ID}, ${ORG}, ${"Protected change agent"})
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO machine_identity_memberships (
        id,
        org_id,
        machine_identity_id,
        project_id,
        authorization_scopes
      )
      VALUES (
        ${TEST_MACHINE_MEM_ID},
        ${ORG},
        ${TEST_MACHINE_ID},
        ${PROJECT},
        ${[AUTHORIZATION_SCOPES.secretProtectedDraftWrite]}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  });
}

describeIntegration("protected change orchestrator data model (INS-82)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
    await cleanupProtectedChanges();
    await Promise.all([
      ensureProtectedEnvironment(TEST_ENV_IDS.create, "Protected Change Create Test"),
      ensureProtectedEnvironment(TEST_ENV_IDS.deniedTransition, "Protected Change Denied Test"),
      ensureProtectedEnvironment(TEST_ENV_IDS.fullFlow, "Protected Change Flow Test"),
      ensureProtectedEnvironment(TEST_ENV_IDS.machineRequester, "Protected Change Machine Test"),
    ]);
    await seedMachineRequester();
  });

  afterAll(async () => {
    await cleanupProtectedChanges();
    await closeRuntimeSql();
  });

  it("creates tenant-qualified proposed records scoped to project and protected environment", async () => {
    const protectedChangeId = generateProtectedChangeId();
    const requestIdValue = requestId.brand("req_00000000000000000000000090");
    const envId = environmentId.brand(TEST_ENV_IDS.create);

    const record = await createProtectedChange({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: envId,
      protectedChangeId,
      requester: { userId: REQUESTER },
      draftVersionIds: [DRAFT_VERSION_ID as never],
      actor: { type: "user", userId: REQUESTER },
      auditActor: { type: "user", userId: REQUESTER },
      requestId: requestIdValue,
      isProtectedEnvironment: true,
    });

    expect(record.state).toBe("proposed");
    expect(record.projectId).toBe(PROJECT);
    expect(record.environmentId).toBe(envId);
    expect(record.draftVersionIds).toEqual([DRAFT_VERSION_ID]);
  });

  it("audits denied invalid transitions without mutating state", async () => {
    const protectedChangeId = generateProtectedChangeId();
    const requestIdValue = requestId.brand("req_00000000000000000000000091");
    const envId = environmentId.brand(TEST_ENV_IDS.deniedTransition);

    await createProtectedChange({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: envId,
      protectedChangeId,
      requester: { userId: REQUESTER },
      draftVersionIds: [DRAFT_VERSION_ID as never],
      actor: { type: "user", userId: REQUESTER },
      auditActor: { type: "user", userId: REQUESTER },
      requestId: requestIdValue,
      isProtectedEnvironment: true,
    });

    await expect(
      approveProtectedChange({
        organizationId: ORG,
        protectedChangeId,
        actor: { type: "user", userId: APPROVER },
        auditActor: { type: "user", userId: APPROVER },
        requestId: requestId.brand("req_00000000000000000000000092"),
        impactReviewFingerprint: "impact-fingerprint-v1",
        approvalEvidence: {
          evidenceId: generateApprovalEvidenceId(),
          approverUserId: APPROVER,
          auditEventId: auditEventId.generate(),
          impactReviewFingerprint: "impact-fingerprint-v1",
        },
      }),
    ).rejects.toBeInstanceOf(ProtectedChangeError);

    const auditRows = await withTenantScope(
      { kind: "organization", organizationId: ORG as never },
      ({ sql }) =>
        sql<{ event_code: string; details: unknown }[]>`
          SELECT event_code, details
          FROM audit_events
          WHERE related_resource_id = ${protectedChangeId}
            AND event_code = ${PRODUCTION_AUDIT_EVENT_CODES.protectedChangeTransitionDenied}
          ORDER BY created_at DESC
          LIMIT 1
        `,
    );
    expect(auditRows[0]?.event_code).toBe(
      PRODUCTION_AUDIT_EVENT_CODES.protectedChangeTransitionDenied,
    );
    expect(auditRows[0]?.details).toEqual({
      fromState: PROTECTED_CHANGE_STATE_CODES.proposed,
      toState: PROTECTED_CHANGE_STATE_CODES.approved,
    });
  });

  it("allows machine-identity requesters to create protected changes", async () => {
    const protectedChangeId = generateProtectedChangeId();
    const machine = machineIdentityId.brand(TEST_MACHINE_ID);
    const envId = environmentId.brand(TEST_ENV_IDS.machineRequester);

    const record = await createProtectedChange({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: envId,
      protectedChangeId,
      requester: { machineIdentityId: machine },
      draftVersionIds: [DRAFT_VERSION_ID as never],
      actor: {
        type: "machine",
        machineIdentityId: machine,
        tokenScope: {
          organizationId: ORG,
          projectId: PROJECT,
          environmentId: envId,
        },
        credentialScopes: [AUTHORIZATION_SCOPES.secretProtectedDraftWrite],
      },
      auditActor: { type: "machine", machineIdentityId: machine },
      requestId: requestId.generate(),
      isProtectedEnvironment: true,
    });

    expect(record.state).toBe("proposed");
    expect(record.requesterMachineIdentityId).toBe(machine);
    expect(record.requesterUserId).toBeNull();
  });

  it("covers allowed transitions, approval evidence, stale closure, rejection, and cancellation", async () => {
    const protectedChangeId = generateProtectedChangeId();
    const envId = environmentId.brand(TEST_ENV_IDS.fullFlow);

    await createProtectedChange({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: envId,
      protectedChangeId,
      requester: { userId: REQUESTER },
      draftVersionIds: [DRAFT_VERSION_ID as never],
      actor: { type: "user", userId: REQUESTER },
      auditActor: { type: "user", userId: REQUESTER },
      requestId: requestId.generate(),
      isProtectedEnvironment: true,
    });

    const pending = await submitProtectedChangeForApproval({
      organizationId: ORG,
      protectedChangeId,
      actor: { type: "user", userId: REQUESTER },
      auditActor: { type: "user", userId: REQUESTER },
      requestId: requestId.generate(),
    });
    expect(pending.state).toBe("pending_approval");

    const fingerprint = "impact-fingerprint-accepted";
    const approved = await approveProtectedChange({
      organizationId: ORG,
      protectedChangeId,
      actor: { type: "user", userId: APPROVER },
      auditActor: { type: "user", userId: APPROVER },
      requestId: requestId.generate(),
      impactReviewFingerprint: fingerprint,
      approvalEvidence: {
        evidenceId: generateApprovalEvidenceId(),
        approverUserId: APPROVER,
        auditEventId: auditEventId.generate(),
        operationId: operationId.generate(),
        impactReviewFingerprint: fingerprint,
      },
    });
    expect(approved.state).toBe("approved");

    const evidence = await withTenantScope(
      { kind: "organization", organizationId: ORG as never },
      ({ sql }) =>
        sql<
          {
            approver_user_id: string;
            audit_event_id: string;
            operation_id: string | null;
            impact_review_fingerprint: string;
          }[]
        >`
          SELECT approver_user_id, audit_event_id, operation_id, impact_review_fingerprint
          FROM protected_change_approval_evidence
          WHERE protected_change_id = ${protectedChangeId}
        `,
    );
    expect(evidence[0]?.approver_user_id).toBe(APPROVER);
    expect(evidence[0]?.impact_review_fingerprint).toBe(fingerprint);
    expect(evidence[0]?.operation_id).toMatch(/^op_/);
    expect(evidence[0]?.audit_event_id).toMatch(/^aud_/);

    const executing = await beginProtectedChangeExecution({
      organizationId: ORG,
      protectedChangeId,
      actor: { type: "user", userId: REQUESTER },
      auditActor: { type: "user", userId: REQUESTER },
      requestId: requestId.generate(),
      executionOperationId: operationId.generate(),
    });
    expect(executing.state).toBe("executing");

    const succeeded = await completeProtectedChangeExecution({
      organizationId: ORG,
      protectedChangeId,
      actor: { type: "user", userId: REQUESTER },
      auditActor: { type: "user", userId: REQUESTER },
      requestId: requestId.generate(),
    });
    expect(succeeded.state).toBe("succeeded");

    const cancelId = generateProtectedChangeId();
    await createProtectedChange({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: envId,
      protectedChangeId: cancelId,
      requester: { userId: REQUESTER },
      draftVersionIds: [DRAFT_VERSION_ID as never],
      actor: { type: "user", userId: REQUESTER },
      auditActor: { type: "user", userId: REQUESTER },
      requestId: requestId.generate(),
      isProtectedEnvironment: true,
    });
    await submitProtectedChangeForApproval({
      organizationId: ORG,
      protectedChangeId: cancelId,
      actor: { type: "user", userId: REQUESTER },
      auditActor: { type: "user", userId: REQUESTER },
      requestId: requestId.generate(),
    });
    const canceled = await cancelProtectedChange({
      organizationId: ORG,
      protectedChangeId: cancelId,
      actor: { type: "user", userId: REQUESTER },
      auditActor: { type: "user", userId: REQUESTER },
      requestId: requestId.generate(),
    });
    expect(canceled.state).toBe("canceled");

    const rejectId = generateProtectedChangeId();
    await createProtectedChange({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: envId,
      protectedChangeId: rejectId,
      requester: { userId: REQUESTER },
      draftVersionIds: [DRAFT_VERSION_ID as never],
      actor: { type: "user", userId: REQUESTER },
      auditActor: { type: "user", userId: REQUESTER },
      requestId: requestId.generate(),
      isProtectedEnvironment: true,
    });
    await submitProtectedChangeForApproval({
      organizationId: ORG,
      protectedChangeId: rejectId,
      actor: { type: "user", userId: REQUESTER },
      auditActor: { type: "user", userId: REQUESTER },
      requestId: requestId.generate(),
    });
    const rejected = await rejectProtectedChange({
      organizationId: ORG,
      protectedChangeId: rejectId,
      actor: { type: "user", userId: APPROVER },
      auditActor: { type: "user", userId: APPROVER },
      requestId: requestId.generate(),
      closureReasonCode: "approval.rejected",
    });
    expect(rejected.state).toBe("rejected");

    const staleId = generateProtectedChangeId();
    await createProtectedChange({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: envId,
      protectedChangeId: staleId,
      requester: { userId: REQUESTER },
      draftVersionIds: [DRAFT_VERSION_ID as never],
      actor: { type: "user", userId: REQUESTER },
      auditActor: { type: "user", userId: REQUESTER },
      requestId: requestId.generate(),
      isProtectedEnvironment: true,
    });
    await submitProtectedChangeForApproval({
      organizationId: ORG,
      protectedChangeId: staleId,
      actor: { type: "user", userId: REQUESTER },
      auditActor: { type: "user", userId: REQUESTER },
      requestId: requestId.generate(),
    });
    const stale = await closeProtectedChangeStale({
      organizationId: ORG,
      protectedChangeId: staleId,
      actor: { type: "user", userId: REQUESTER },
      auditActor: { type: "user", userId: REQUESTER },
      requestId: requestId.generate(),
      closureReasonCode: "protected_change.policy_stale",
    });
    expect(stale.state).toBe("stale");
  });

  it("uses Effective Access Resolver scopes instead of role-name shortcuts", () => {
    expect(expandBuiltInRolePresetToScopes("approval")).toEqual(
      expect.arrayContaining([
        AUTHORIZATION_SCOPES.approvalApprove,
        AUTHORIZATION_SCOPES.approvalReject,
      ]),
    );
    expect(expandBuiltInRolePresetToScopes("developer")).not.toContain(
      AUTHORIZATION_SCOPES.approvalApprove,
    );
  });
});
