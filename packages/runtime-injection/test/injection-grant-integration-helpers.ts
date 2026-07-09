import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import {
  ENVIRONMENT_LIFECYCLE_STAGES,
  environmentId,
  userId,
  type DisplayName,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type VariableKey,
} from "@insecur/domain";
import { afterAll, beforeAll, describe } from "vitest";
import { writeProtectedSecret } from "../../secret-store/src/write-protected-secret.js";
import { createTestKeyring } from "../../secret-store/test/integration-helpers.js";
import {
  closeRuntimeSql,
  TenantEnvironmentLifecycleStore,
  TenantSecretVersionStore,
  withTenantScope,
} from "@insecur/tenant-store";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import { TEST_USER_ID } from "../../tenant-store/test/rls/test-ids.js";

export const describeIntegration = integrationDatabaseReady ? describe : describe.skip;
export const PREVIEW_PROTECTED_ENV_ID = "env_00000000000000000000000085";

type RuntimeSql = Parameters<Parameters<typeof withTenantScope>[1]>[0]["sql"];

async function cleanupProtectedChangeData(
  organizationId: OrganizationId,
  sql: RuntimeSql,
): Promise<void> {
  await sql`
    DELETE FROM protected_change_approval_evidence
    WHERE org_id = ${organizationId} AND protected_change_id IN (
      SELECT id FROM protected_changes
      WHERE org_id = ${organizationId} AND environment_id = ${PREVIEW_PROTECTED_ENV_ID}
    )
  `;
  await sql`
    DELETE FROM protected_changes
    WHERE org_id = ${organizationId} AND environment_id = ${PREVIEW_PROTECTED_ENV_ID}
  `;
}

async function cleanupProtectedPreviewEnvironmentData(
  organizationId: OrganizationId,
  sql: RuntimeSql,
): Promise<void> {
  await sql`
    DELETE FROM injection_grants
    WHERE org_id = ${organizationId} AND environment_id = ${PREVIEW_PROTECTED_ENV_ID}
  `;
  await sql`
    UPDATE runtime_injection_policies
    SET active_version_id = NULL
    WHERE org_id = ${organizationId} AND environment_id = ${PREVIEW_PROTECTED_ENV_ID}
  `;
  await sql`
    DELETE FROM runtime_injection_policy_versions
    WHERE policy_id IN (
      SELECT id FROM runtime_injection_policies
      WHERE org_id = ${organizationId} AND environment_id = ${PREVIEW_PROTECTED_ENV_ID}
    )
  `;
  await sql`
    DELETE FROM runtime_injection_policies
    WHERE org_id = ${organizationId} AND environment_id = ${PREVIEW_PROTECTED_ENV_ID}
  `;
  await sql`
    UPDATE secrets
    SET current_version_id = NULL
    WHERE org_id = ${organizationId} AND environment_id = ${PREVIEW_PROTECTED_ENV_ID}
  `;
  await sql`
    DELETE FROM secret_versions
    WHERE org_id = ${organizationId} AND secret_id IN (
      SELECT id FROM secrets
      WHERE org_id = ${organizationId} AND environment_id = ${PREVIEW_PROTECTED_ENV_ID}
    )
  `;
  await sql`
    DELETE FROM secrets
    WHERE org_id = ${organizationId} AND environment_id = ${PREVIEW_PROTECTED_ENV_ID}
  `;
  await cleanupProtectedChangeData(organizationId, sql);
  await sql`DELETE FROM environments WHERE id = ${PREVIEW_PROTECTED_ENV_ID}`;
}

export function describeInjectionGrantIntegration(title: string, suite: () => void): void {
  describeIntegration(title, () => {
    beforeAll(async () => {
      await seedTenantBaseline();
    });

    afterAll(async () => {
      await closeRuntimeSql();
    });

    suite();
  });
}

export async function recreateProtectedPreviewEnvironment(input: {
  organizationId: OrganizationId;
  projectId: ProjectId;
  displayName: DisplayName;
}) {
  const protectedEnvironmentId = environmentId.brand(PREVIEW_PROTECTED_ENV_ID);

  return await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db, sql }) => {
      await cleanupProtectedPreviewEnvironmentData(input.organizationId, sql);

      const store = new TenantEnvironmentLifecycleStore(db);
      const created = await store.create({
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: protectedEnvironmentId,
        displayName: input.displayName,
        lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.preview,
      });

      if (!created.isProtected) {
        throw new Error("protected preview fixture was not protected at creation");
      }

      return created.environmentId;
    },
  );
}

export async function deleteProtectedPreviewEnvironment(organizationId: OrganizationId) {
  await withTenantScope({ kind: "organization", organizationId }, async ({ sql }) => {
    await cleanupProtectedPreviewEnvironmentData(organizationId, sql);
  });
}

/** Seeds a protected-environment secret through draft write + publish (live delivery pointer). */
export async function writeTestProtectedSecret(
  variableKey: VariableKey,
  valueUtf8: Uint8Array,
  tenant: {
    organizationId: OrganizationId;
    projectId: ProjectId;
    environmentId: EnvironmentId;
  },
) {
  const draft = await writeProtectedSecret({
    keyring: createTestKeyring(),
    organizationId: tenant.organizationId,
    projectId: tenant.projectId,
    environmentId: tenant.environmentId,
    variableKey,
    actor: { type: "user", userId: userId.brand(TEST_USER_ID) },
    valueUtf8,
  });

  await withTenantScope(
    { kind: "organization", organizationId: tenant.organizationId },
    async ({ db }) => {
      await new TenantSecretVersionStore(db).publishVersions({
        organizationId: tenant.organizationId,
        targets: [{ secretId: draft.secretId, secretVersionId: draft.secretVersionId }],
      });
    },
  );

  return draft;
}

export async function loadLatestIssueDeniedAudit(organizationId: OrganizationId) {
  return withTenantScope({ kind: "organization", organizationId }, async ({ sql }) => {
    const rows = await sql<
      {
        event_code: string;
        outcome: string;
        result_code: string | null;
      }[]
    >`
      SELECT event_code, outcome, result_code
      FROM audit_events
      WHERE event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssueDenied}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return rows[0];
  });
}

export async function loadAuditRow(organizationId: OrganizationId, auditEventId: string) {
  return withTenantScope({ kind: "organization", organizationId }, async ({ sql }) => {
    const rows = await sql<
      {
        event_code: string;
        outcome: string;
        result_code: string | null;
        resource_type: string | null;
        resource_id: string | null;
        related_resource_type: string | null;
        related_resource_id: string | null;
        details: Record<string, unknown> | null;
      }[]
    >`
      SELECT
        event_code,
        outcome,
        result_code,
        resource_type,
        resource_id,
        related_resource_type,
        related_resource_id,
        details
      FROM audit_events
      WHERE id = ${auditEventId}
      LIMIT 1
    `;
    return rows[0];
  });
}

export async function loadGrantBinding(organizationId: OrganizationId, grantId: string) {
  return withTenantScope({ kind: "organization", organizationId }, async ({ sql }) => {
    const rows = await sql<
      {
        secret_ids: string[];
        secret_version_ids: string[];
        variable_keys: string[];
        policy_id: string | null;
      }[]
    >`
      SELECT secret_ids, secret_version_ids, variable_keys, policy_id
      FROM injection_grants
      WHERE id = ${grantId}
      LIMIT 1
    `;
    return rows[0];
  });
}
