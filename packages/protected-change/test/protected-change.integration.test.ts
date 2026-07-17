import { PRODUCTION_AUDIT_EVENT_CODES } from "@insecur/audit";
import { AUTHORIZATION_SCOPES, expandBuiltInRolePresetToScopes } from "@insecur/access";
import {
  auditEventId,
  APPROVAL_ERROR_CODES,
  ENVIRONMENT_LIFECYCLE_STAGES,
  environmentId,
  machineIdentityId,
  operationId,
  organizationId,
  parseDisplayName,
  projectId,
  PROTECTED_CHANGE_ERROR_CODES,
  requestId,
  secretVersionId,
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
  computeDeliveryTargetFingerprint,
  createProtectedChange,
  enforceProtectedDeliveryApproval,
  generateApprovalEvidenceId,
  generateProtectedChangeId,
  rejectProtectedChange,
  submitProtectedChangeForApproval,
  closeProtectedChangeStale,
  ProtectedChangeError,
  beginProtectedChangeExecution,
  completeProtectedChangeExecution,
  recomputeProtectedChangeImpactFingerprint,
  PROTECTED_CHANGE_STATE_CODES,
  type ProtectedDeliveryTarget,
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
const DRAFT_VERSION_IDS = {
  fullFlow: "sv_00000000000000000000000099",
  deniedTransition: "sv_00000000000000000000000100",
  staleApproval: "sv_00000000000000000000000101",
  staleExecution: "sv_00000000000000000000000102",
  blockedExecution: "sv_00000000000000000000000103",
  invalidDraftExecution: "sv_00000000000000000000000104",
  singleUseDelivery: "sv_00000000000000000000000105",
} as const;

const TEST_ENV_IDS = {
  create: "env_00000000000000000000000082",
  deniedTransition: "env_00000000000000000000000083",
  fullFlow: "env_00000000000000000000000084",
  machineRequester: "env_00000000000000000000000085",
  staleApproval: "env_00000000000000000000000086",
  staleExecution: "env_00000000000000000000000087",
  blockedExecution: "env_00000000000000000000000088",
  invalidDraftExecution: "env_00000000000000000000000089",
  singleUseDelivery: "env_00000000000000000000000090",
} as const;

const TEST_SECRET_IDS = {
  fullFlow: "sec_00000000000000000000000082",
  deniedTransition: "sec_00000000000000000000000086",
  staleApproval: "sec_00000000000000000000000083",
  staleExecution: "sec_00000000000000000000000084",
  blockedExecution: "sec_00000000000000000000000085",
  invalidDraftExecution: "sec_00000000000000000000000087",
  singleUseDelivery: "sec_00000000000000000000000088",
} as const;

const TEST_MACHINE_ID = "mach_00000000000000000000000082";
const TEST_MACHINE_MEM_ID = "mem_00000000000000000000000082";

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
      await sql`DELETE FROM secret_versions WHERE org_id = ${ORG} AND secret_id IN (
        SELECT id FROM secrets WHERE environment_id = ${envId}
      )`;
      await sql`DELETE FROM secrets WHERE org_id = ${ORG} AND environment_id = ${envId}`;
      await sql`DELETE FROM environments WHERE id = ${envId}`;
    }
    await sql`DELETE FROM machine_identity_memberships WHERE id = ${TEST_MACHINE_MEM_ID}`;
    await sql`DELETE FROM machine_identities WHERE id = ${TEST_MACHINE_ID}`;
  });
}

async function seedDraftSecret(input: {
  readonly environmentId: string;
  readonly secretId: string;
  readonly secretVersionId: string;
}): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ sql }) => {
    await sql`
      INSERT INTO secrets (
        id,
        org_id,
        project_id,
        environment_id,
        variable_key,
        current_version_id
      )
      VALUES (
        ${input.secretId},
        ${ORG},
        ${PROJECT},
        ${input.environmentId},
        ${"PROTECTED_CHANGE_TEST_KEY"},
        NULL
      )
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO secret_versions (
        id,
        org_id,
        secret_id,
        version_number,
        organization_data_key_version,
        project_data_key_version,
        ciphertext_storage_ref,
        lifecycle_state,
        value_byte_length,
        encoding_class,
        is_empty,
        has_leading_or_trailing_whitespace,
        looks_like_placeholder,
        secret_shape_match_verdict
      )
      VALUES (
        ${input.secretVersionId},
        ${ORG},
        ${input.secretId},
        ${1},
        ${1},
        ${1},
        ${"synthetic-ciphertext-ref"},
        ${"draft"},
        ${24},
        ${"utf-8"},
        ${false},
        ${false},
        ${false},
        ${"matches"}
      )
      ON CONFLICT (id) DO NOTHING
    `;
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
      ensureProtectedEnvironment(
        TEST_ENV_IDS.staleApproval,
        "Protected Change Stale Approval Test",
      ),
      ensureProtectedEnvironment(
        TEST_ENV_IDS.staleExecution,
        "Protected Change Stale Execution Test",
      ),
      ensureProtectedEnvironment(
        TEST_ENV_IDS.blockedExecution,
        "Protected Change Blocked Execution Test",
      ),
      ensureProtectedEnvironment(
        TEST_ENV_IDS.invalidDraftExecution,
        "Protected Change Invalid Draft Execution Test",
      ),
      ensureProtectedEnvironment(
        TEST_ENV_IDS.singleUseDelivery,
        "Protected Change Single Use Delivery Test",
      ),
    ]);
    await Promise.all([
      seedDraftSecret({
        environmentId: TEST_ENV_IDS.deniedTransition,
        secretId: TEST_SECRET_IDS.deniedTransition,
        secretVersionId: DRAFT_VERSION_IDS.deniedTransition,
      }),
      seedDraftSecret({
        environmentId: TEST_ENV_IDS.fullFlow,
        secretId: TEST_SECRET_IDS.fullFlow,
        secretVersionId: DRAFT_VERSION_IDS.fullFlow,
      }),
      seedDraftSecret({
        environmentId: TEST_ENV_IDS.staleApproval,
        secretId: TEST_SECRET_IDS.staleApproval,
        secretVersionId: DRAFT_VERSION_IDS.staleApproval,
      }),
      seedDraftSecret({
        environmentId: TEST_ENV_IDS.staleExecution,
        secretId: TEST_SECRET_IDS.staleExecution,
        secretVersionId: DRAFT_VERSION_IDS.staleExecution,
      }),
      seedDraftSecret({
        environmentId: TEST_ENV_IDS.blockedExecution,
        secretId: TEST_SECRET_IDS.blockedExecution,
        secretVersionId: DRAFT_VERSION_IDS.blockedExecution,
      }),
      seedDraftSecret({
        environmentId: TEST_ENV_IDS.invalidDraftExecution,
        secretId: TEST_SECRET_IDS.invalidDraftExecution,
        secretVersionId: DRAFT_VERSION_IDS.invalidDraftExecution,
      }),
      seedDraftSecret({
        environmentId: TEST_ENV_IDS.singleUseDelivery,
        secretId: TEST_SECRET_IDS.singleUseDelivery,
        secretVersionId: DRAFT_VERSION_IDS.singleUseDelivery,
      }),
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
      draftVersionIds: [secretVersionId.brand(DRAFT_VERSION_IDS.fullFlow)],
      actor: { type: "user", userId: REQUESTER },
      auditActor: { type: "user", userId: REQUESTER },
      requestId: requestIdValue,
      isProtectedEnvironment: true,
    });

    expect(record.state).toBe("proposed");
    expect(record.projectId).toBe(PROJECT);
    expect(record.environmentId).toBe(envId);
    expect(record.draftVersionIds).toEqual([DRAFT_VERSION_IDS.fullFlow]);
  });

  it("audits denied invalid transitions without mutating state", async () => {
    const protectedChangeId = generateProtectedChangeId();
    const requestIdValue = requestId.brand("req_00000000000000000000000091");
    const envId = environmentId.brand(TEST_ENV_IDS.deniedTransition);

    const created = await createProtectedChange({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: envId,
      protectedChangeId,
      requester: { userId: REQUESTER },
      draftVersionIds: [secretVersionId.brand(DRAFT_VERSION_IDS.deniedTransition)],
      actor: { type: "user", userId: REQUESTER },
      auditActor: { type: "user", userId: REQUESTER },
      requestId: requestIdValue,
      isProtectedEnvironment: true,
    });
    const fingerprint = await recomputeProtectedChangeImpactFingerprint(created);

    await expect(
      approveProtectedChange({
        organizationId: ORG,
        protectedChangeId,
        actor: { type: "user", userId: APPROVER },
        auditActor: { type: "user", userId: APPROVER },
        requestId: requestId.brand("req_00000000000000000000000092"),
        impactReviewFingerprint: fingerprint,
        approvalEvidence: {
          evidenceId: generateApprovalEvidenceId(),
          approverUserId: APPROVER,
          auditEventId: auditEventId.generate(),
          impactReviewFingerprint: fingerprint,
        },
      }),
    ).rejects.toBeInstanceOf(ProtectedChangeError);

    const auditRows = await withTenantScope(
      { kind: "organization", organizationId: ORG as never },
      ({ sql }) =>
        sql<{ event_code: string; details: unknown }[]>`
          SELECT event_code, details
          FROM audit_events
          WHERE resource_id = ${protectedChangeId}
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
      draftVersionIds: [secretVersionId.brand(DRAFT_VERSION_IDS.fullFlow)],
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
      draftVersionIds: [secretVersionId.brand(DRAFT_VERSION_IDS.fullFlow)],
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

    const fingerprint = await recomputeProtectedChangeImpactFingerprint(pending);
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
      draftVersionIds: [secretVersionId.brand(DRAFT_VERSION_IDS.fullFlow)],
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
      draftVersionIds: [secretVersionId.brand(DRAFT_VERSION_IDS.fullFlow)],
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
      draftVersionIds: [secretVersionId.brand(DRAFT_VERSION_IDS.fullFlow)],
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

  it("rejects stale approval without persisting evidence and leaves the request pending", async () => {
    const protectedChangeId = generateProtectedChangeId();
    const envId = environmentId.brand(TEST_ENV_IDS.staleApproval);

    await createProtectedChange({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: envId,
      protectedChangeId,
      requester: { userId: REQUESTER },
      draftVersionIds: [secretVersionId.brand(DRAFT_VERSION_IDS.staleApproval)],
      actor: { type: "user", userId: REQUESTER },
      auditActor: { type: "user", userId: REQUESTER },
      requestId: requestId.generate(),
      isProtectedEnvironment: true,
    });
    await submitProtectedChangeForApproval({
      organizationId: ORG,
      protectedChangeId,
      actor: { type: "user", userId: REQUESTER },
      auditActor: { type: "user", userId: REQUESTER },
      requestId: requestId.generate(),
    });

    await expect(
      approveProtectedChange({
        organizationId: ORG,
        protectedChangeId,
        actor: { type: "user", userId: APPROVER },
        auditActor: { type: "user", userId: APPROVER },
        requestId: requestId.generate(),
        impactReviewFingerprint: "sha256:stale-submitted-fingerprint",
        approvalEvidence: {
          evidenceId: generateApprovalEvidenceId(),
          approverUserId: APPROVER,
          auditEventId: auditEventId.generate(),
          impactReviewFingerprint: "sha256:stale-submitted-fingerprint",
        },
      }),
    ).rejects.toMatchObject({ code: APPROVAL_ERROR_CODES.reviewStale });

    const [record, evidence] = await withTenantScope(
      { kind: "organization", organizationId: ORG as never },
      async ({ sql }) => {
        const rows = await sql<{ state: string }[]>`
          SELECT state FROM protected_changes WHERE id = ${protectedChangeId}
        `;
        const evidenceRows = await sql<{ id: string }[]>`
          SELECT id FROM protected_change_approval_evidence WHERE protected_change_id = ${protectedChangeId}
        `;
        return [rows[0], evidenceRows[0]] as const;
      },
    );
    expect(record?.state).toBe("pending_approval");
    expect(evidence).toBeUndefined();
  });

  it("rejects stale execution handoff when approval evidence no longer matches current impact", async () => {
    const protectedChangeId = generateProtectedChangeId();
    const envId = environmentId.brand(TEST_ENV_IDS.staleExecution);
    const draftVersionId = secretVersionId.brand(DRAFT_VERSION_IDS.staleExecution);

    await createProtectedChange({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: envId,
      protectedChangeId,
      requester: { userId: REQUESTER },
      draftVersionIds: [draftVersionId],
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

    const fingerprintAtApproval = await recomputeProtectedChangeImpactFingerprint(pending);

    await approveProtectedChange({
      organizationId: ORG,
      protectedChangeId,
      actor: { type: "user", userId: APPROVER },
      auditActor: { type: "user", userId: APPROVER },
      requestId: requestId.generate(),
      impactReviewFingerprint: fingerprintAtApproval,
      approvalEvidence: {
        evidenceId: generateApprovalEvidenceId(),
        approverUserId: APPROVER,
        auditEventId: auditEventId.generate(),
        impactReviewFingerprint: fingerprintAtApproval,
      },
    });

    await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ sql }) => {
      await sql`
        UPDATE secret_versions
        SET value_byte_length = ${48}
        WHERE id = ${draftVersionId}
      `;
    });

    await expect(
      beginProtectedChangeExecution({
        organizationId: ORG,
        protectedChangeId,
        actor: { type: "user", userId: REQUESTER },
        auditActor: { type: "user", userId: REQUESTER },
        requestId: requestId.generate(),
        executionOperationId: operationId.generate(),
      }),
    ).rejects.toMatchObject({ code: APPROVAL_ERROR_CODES.reviewStale });

    const record = await withTenantScope(
      { kind: "organization", organizationId: ORG as never },
      ({ sql }) =>
        sql<{ state: string }[]>`
          SELECT state FROM protected_changes WHERE id = ${protectedChangeId}
        `,
    );
    expect(record[0]?.state).toBe("approved");
  });

  it("blocks execution for rejected, canceled, and stale requests", async () => {
    const envId = environmentId.brand(TEST_ENV_IDS.blockedExecution);
    const terminalStates = [
      { close: rejectProtectedChange, state: "rejected" as const },
      { close: cancelProtectedChange, state: "canceled" as const },
      {
        close: closeProtectedChangeStale,
        state: "stale" as const,
        closureReasonCode: "protected_change.policy_stale",
      },
    ] as const;

    for (const terminal of terminalStates) {
      const protectedChangeId = generateProtectedChangeId();
      await createProtectedChange({
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: envId,
        protectedChangeId,
        requester: { userId: REQUESTER },
        draftVersionIds: [secretVersionId.brand(DRAFT_VERSION_IDS.blockedExecution)],
        actor: { type: "user", userId: REQUESTER },
        auditActor: { type: "user", userId: REQUESTER },
        requestId: requestId.generate(),
        isProtectedEnvironment: true,
      });
      await submitProtectedChangeForApproval({
        organizationId: ORG,
        protectedChangeId,
        actor: { type: "user", userId: REQUESTER },
        auditActor: { type: "user", userId: REQUESTER },
        requestId: requestId.generate(),
      });

      if (terminal.state === "rejected") {
        await rejectProtectedChange({
          organizationId: ORG,
          protectedChangeId,
          actor: { type: "user", userId: APPROVER },
          auditActor: { type: "user", userId: APPROVER },
          requestId: requestId.generate(),
          closureReasonCode: "approval.rejected",
        });
      } else if (terminal.state === "canceled") {
        await cancelProtectedChange({
          organizationId: ORG,
          protectedChangeId,
          actor: { type: "user", userId: REQUESTER },
          auditActor: { type: "user", userId: REQUESTER },
          requestId: requestId.generate(),
        });
      } else {
        await closeProtectedChangeStale({
          organizationId: ORG,
          protectedChangeId,
          actor: { type: "user", userId: REQUESTER },
          auditActor: { type: "user", userId: REQUESTER },
          requestId: requestId.generate(),
          closureReasonCode: terminal.closureReasonCode,
        });
      }

      await expect(
        beginProtectedChangeExecution({
          organizationId: ORG,
          protectedChangeId,
          actor: { type: "user", userId: REQUESTER },
          auditActor: { type: "user", userId: REQUESTER },
          requestId: requestId.generate(),
          executionOperationId: operationId.generate(),
        }),
      ).rejects.toBeInstanceOf(ProtectedChangeError);
    }
  });

  it("records invalid_draft_selection when draft targets are gone before execution", async () => {
    const protectedChangeId = generateProtectedChangeId();
    const envId = environmentId.brand(TEST_ENV_IDS.invalidDraftExecution);
    const draftVersionId = secretVersionId.brand(DRAFT_VERSION_IDS.invalidDraftExecution);

    await createProtectedChange({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: envId,
      protectedChangeId,
      requester: { userId: REQUESTER },
      draftVersionIds: [draftVersionId],
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
    const fingerprintAtApproval = await recomputeProtectedChangeImpactFingerprint(pending);

    await approveProtectedChange({
      organizationId: ORG,
      protectedChangeId,
      actor: { type: "user", userId: APPROVER },
      auditActor: { type: "user", userId: APPROVER },
      requestId: requestId.generate(),
      impactReviewFingerprint: fingerprintAtApproval,
      approvalEvidence: {
        evidenceId: generateApprovalEvidenceId(),
        approverUserId: APPROVER,
        auditEventId: auditEventId.generate(),
        impactReviewFingerprint: fingerprintAtApproval,
      },
    });

    await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ sql }) => {
      await sql`
        UPDATE secret_versions
        SET lifecycle_state = ${"live"}
        WHERE id = ${draftVersionId}
      `;
    });

    await expect(
      beginProtectedChangeExecution({
        organizationId: ORG,
        protectedChangeId,
        actor: { type: "user", userId: REQUESTER },
        auditActor: { type: "user", userId: REQUESTER },
        requestId: requestId.generate(),
        executionOperationId: operationId.generate(),
      }),
    ).rejects.toMatchObject({ code: APPROVAL_ERROR_CODES.invalidDraftSelection });

    const auditRows = await withTenantScope(
      { kind: "organization", organizationId: ORG as never },
      ({ sql }) =>
        sql<{ result_code: string }[]>`
          SELECT result_code
          FROM audit_events
          WHERE resource_id = ${protectedChangeId}
            AND event_code = ${PRODUCTION_AUDIT_EVENT_CODES.protectedChangeTransitionDenied}
          ORDER BY created_at DESC
          LIMIT 1
        `,
    );
    expect(auditRows[0]?.result_code).toBe(APPROVAL_ERROR_CODES.invalidDraftSelection);
  });

  it("consumes approval evidence on exactly one delivery execution and denies replay (INS-607)", async () => {
    const protectedChangeId = generateProtectedChangeId();
    const envId = environmentId.brand(TEST_ENV_IDS.singleUseDelivery);
    const target: ProtectedDeliveryTarget = {
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: envId,
      kind: "secret_sync_enable",
      targetId: "sync_00000000000000000000000090",
    };

    await createProtectedChange({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: envId,
      protectedChangeId,
      requester: { userId: REQUESTER },
      draftVersionIds: [secretVersionId.brand(DRAFT_VERSION_IDS.singleUseDelivery)],
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
    const fingerprint = await recomputeProtectedChangeImpactFingerprint(pending);
    await approveProtectedChange({
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
        impactReviewFingerprint: fingerprint,
        deliveryTargetFingerprint: await computeDeliveryTargetFingerprint(target),
      },
    });

    const enforceOnce = () =>
      enforceProtectedDeliveryApproval({
        target,
        protectedChangeId,
        actor: { type: "user", userId: REQUESTER },
        auditActor: { type: "user", userId: REQUESTER },
        requestId: requestId.generate(),
      });

    // Concurrent double-execution: both callers race the consume compare-and-set on the same
    // evidence row; the database admits at most one.
    const raced = await Promise.allSettled([enforceOnce(), enforceOnce()]);
    const authorized = raced.filter((result) => result.status === "fulfilled");
    const denied = raced.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(authorized).toHaveLength(1);
    expect(denied).toHaveLength(1);
    expect(denied[0]?.reason).toMatchObject({
      code: PROTECTED_CHANGE_ERROR_CODES.approvalNotAuthorized,
    });

    // Replay after execution — a later reconfiguration or repeat run — is denied.
    await expect(enforceOnce()).rejects.toMatchObject({
      code: PROTECTED_CHANGE_ERROR_CODES.approvalNotAuthorized,
    });

    const consumedRows = await withTenantScope(
      { kind: "organization", organizationId: ORG as never },
      ({ sql }) =>
        sql<{ consumed_at: Date | null }[]>`
          SELECT consumed_at
          FROM protected_change_approval_evidence
          WHERE protected_change_id = ${protectedChangeId}
        `,
    );
    expect(consumedRows).toHaveLength(1);
    expect(consumedRows[0]?.consumed_at).not.toBeNull();
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
