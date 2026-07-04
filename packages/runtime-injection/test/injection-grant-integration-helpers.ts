import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import {
  ENVIRONMENT_LIFECYCLE_STAGES,
  environmentId,
  type DisplayName,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";
import { afterAll, beforeAll, describe } from "vitest";
import {
  closeRuntimeSql,
  TenantEnvironmentLifecycleStore,
  withTenantScope,
} from "@insecur/tenant-store";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";

export const describeIntegration = integrationDatabaseReady ? describe : describe.skip;
export const PREVIEW_PROTECTED_ENV_ID = "env_00000000000000000000000071";

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
      await sql`DELETE FROM environments WHERE id = ${PREVIEW_PROTECTED_ENV_ID}`;

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
    await sql`DELETE FROM environments WHERE id = ${PREVIEW_PROTECTED_ENV_ID}`;
  });
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
