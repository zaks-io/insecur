import {
  AUTHORIZATION_SCOPES,
  BUILT_IN_ROLE_PRESETS,
  hasAuthorizationScope,
  resolveEffectiveAccess,
} from "@insecur/access";
import { PRODUCTION_AUDIT_EVENT_CODES } from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  ENVIRONMENT_POSTURE_TIERS,
  environmentId,
  organizationId,
  parseDisplayName,
  projectId,
  userId,
} from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TenantEnvironmentLifecycleStore,
  closeRuntimeSql,
  withTenantScope,
} from "@insecur/tenant-store";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_ENV_A_ID,
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
  TEST_PROJECT_A_ID,
  TEST_PROJECT_B_ID,
  TEST_TEAM_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";
import {
  EnvironmentLifecycleError,
  createEnvironmentLifecycle,
  getAuthorizedEnvironmentLifecycle,
  updateAuthorizedEnvironmentLifecycle,
} from "../src/index.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

function testDisplayName(value: string) {
  const parsed = parseDisplayName(value);
  if (!parsed.ok) {
    throw new Error(`invalid display name: ${value}`);
  }
  return parsed.value;
}

const PREVIEW_ENV_ID = "env_00000000000000000000000099";
const PREVIEW_OPT_DOWN_ENV_ID = "env_00000000000000000000000098";
const DEVELOPER_MEM_ID = "mem_00000000000000000000000097";

interface AuditRow {
  event_code: string;
  outcome: string;
  result_code: string | null;
}

describeIntegration("environment lifecycle metadata", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
    await seedPreviewEnvironments();
    await seedDeveloperMembership();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("reads durable protected posture without inferring from display name", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    const project = projectId.brand(TEST_PROJECT_A_ID);
    const env = environmentId.brand(PREVIEW_ENV_ID);
    const actor = { type: "user" as const, userId: userId.brand(TEST_USER_ID) };
    const accessCoordinate = {
      organizationId: org,
      projectId: project,
      environmentId: env,
    };
    const effectiveAccess = await resolveEffectiveAccess(actor, accessCoordinate);

    const lifecycle = await getAuthorizedEnvironmentLifecycle({
      actor,
      organizationId: org,
      projectId: project,
      environmentId: env,
      effectiveAccess,
      accessCoordinate,
    });

    expect(lifecycle.displayName).toBe("Throwaway Preview");
    expect(lifecycle.postureTier).toBe(ENVIRONMENT_POSTURE_TIERS.preview);
    expect(lifecycle.isProtected).toBe(true);
    expect(lifecycle.previewNonProtectedOptDown).toBeUndefined();
  });

  it("stores preview opt-down evidence for non-protected preview environments", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    const project = projectId.brand(TEST_PROJECT_A_ID);
    const env = environmentId.brand(PREVIEW_OPT_DOWN_ENV_ID);
    const actor = { type: "user" as const, userId: userId.brand(TEST_USER_ID) };
    const accessCoordinate = {
      organizationId: org,
      projectId: project,
      environmentId: env,
    };
    const effectiveAccess = await resolveEffectiveAccess(actor, accessCoordinate);

    const lifecycle = await getAuthorizedEnvironmentLifecycle({
      actor,
      organizationId: org,
      projectId: project,
      environmentId: env,
      effectiveAccess,
      accessCoordinate,
    });

    expect(lifecycle.isProtected).toBe(false);
    expect(lifecycle.previewNonProtectedOptDown?.actorUserId).toBe(userId.brand(TEST_USER_ID));
    expect(lifecycle.previewNonProtectedOptDown?.optedDownAt).toBeInstanceOf(Date);
  });

  it("denies lifecycle updates without project configure scope", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    const project = projectId.brand(TEST_PROJECT_A_ID);
    const env = environmentId.brand(PREVIEW_OPT_DOWN_ENV_ID);
    const developer = userId.brand("usr_00000000000000000000000097");
    const actor = { type: "user" as const, userId: developer };
    const accessCoordinate = {
      organizationId: org,
      projectId: project,
      environmentId: env,
    };
    const effectiveAccess = await resolveEffectiveAccess(actor, accessCoordinate);
    expect(hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.environmentRead)).toBe(true);
    expect(hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.projectConfigure)).toBe(
      false,
    );

    await expect(
      updateAuthorizedEnvironmentLifecycle({
        actor,
        organizationId: org,
        projectId: project,
        environmentId: env,
        previewAutomationOptIn: true,
        effectiveAccess,
        accessCoordinate,
      }),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    const auditRows = await withTenantScope(
      { kind: "organization", organizationId: org },
      (sql) =>
        sql<AuditRow[]>`
        SELECT event_code, outcome, result_code
        FROM audit_events
        WHERE event_code = ${PRODUCTION_AUDIT_EVENT_CODES.environmentLifecycleUpdateDenied}
        ORDER BY created_at DESC
        LIMIT 1
      `,
    );
    expect(auditRows[0]?.outcome).toBe("denied");
    expect(auditRows[0]?.result_code).toBe(AUTH_ERROR_CODES.insufficientScope);
  });

  it("blocks cross-tenant lifecycle reads under tenant scope", async () => {
    const orgB = organizationId.brand(TEST_ORG_B_ID);
    const envA = environmentId.brand(TEST_ENV_A_ID);

    const lifecycle = await withTenantScope(
      { kind: "organization", organizationId: orgB },
      async (sql) =>
        new TenantEnvironmentLifecycleStore(sql).getByProjectCoordinate(
          orgB,
          projectId.brand(TEST_PROJECT_B_ID),
          envA,
        ),
    );

    expect(lifecycle).toBeUndefined();
  });

  it("denies unauthorized lifecycle read with audit", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    const project = projectId.brand(TEST_PROJECT_A_ID);
    const env = environmentId.brand(PREVIEW_OPT_DOWN_ENV_ID);
    const developer = userId.brand("usr_00000000000000000000000097");
    const actor = { type: "user" as const, userId: developer };
    const accessCoordinate = {
      organizationId: org,
      projectId: project,
    };
    const effectiveAccess = await resolveEffectiveAccess(actor, accessCoordinate);

    await expect(
      getAuthorizedEnvironmentLifecycle({
        actor,
        organizationId: org,
        projectId: project,
        environmentId: env,
        effectiveAccess,
        accessCoordinate,
      }),
    ).rejects.toBeInstanceOf(EnvironmentLifecycleError);

    const auditRows = await withTenantScope(
      { kind: "organization", organizationId: org },
      (sql) =>
        sql<AuditRow[]>`
        SELECT event_code, outcome, result_code
        FROM audit_events
        WHERE event_code = ${PRODUCTION_AUDIT_EVENT_CODES.environmentLifecycleReadDenied}
        ORDER BY created_at DESC
        LIMIT 1
      `,
    );
    expect(auditRows[0]?.outcome).toBe("denied");
  });
});

async function seedPreviewEnvironments(): Promise<void> {
  const org = organizationId.brand(TEST_ORG_A_ID);
  const project = projectId.brand(TEST_PROJECT_A_ID);
  const actor = userId.brand(TEST_USER_ID);

  await createEnvironmentLifecycle({
    environmentId: environmentId.brand(PREVIEW_ENV_ID),
    organizationId: org,
    projectId: project,
    displayName: testDisplayName("Throwaway Preview"),
    postureTier: ENVIRONMENT_POSTURE_TIERS.preview,
  });

  await createEnvironmentLifecycle({
    environmentId: environmentId.brand(PREVIEW_OPT_DOWN_ENV_ID),
    organizationId: org,
    projectId: project,
    displayName: testDisplayName("Safe Preview"),
    postureTier: ENVIRONMENT_POSTURE_TIERS.preview,
    previewNonProtectedOptDown: {
      optedDownAt: new Date("2026-06-01T12:00:00.000Z"),
      actorUserId: actor,
    },
  });
}

async function seedDeveloperMembership(): Promise<void> {
  const org = organizationId.brand(TEST_ORG_A_ID);
  await withTenantScope({ kind: "organization", organizationId: org }, async (sql) => {
    await sql`
      INSERT INTO memberships (id, org_id, team_id, user_id, role_preset, project_id)
      VALUES (
        ${DEVELOPER_MEM_ID},
        ${TEST_ORG_A_ID},
        ${TEST_TEAM_A_ID},
        ${"usr_00000000000000000000000097"},
        ${BUILT_IN_ROLE_PRESETS.developer},
        ${TEST_PROJECT_A_ID}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  });
}
