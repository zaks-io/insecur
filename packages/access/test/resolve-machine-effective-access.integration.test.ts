import {
  AUTHORIZATION_SCOPES,
  CREDENTIAL_SCOPES,
  hasAuthorizationScope,
  resolveEffectiveAccess,
} from "../src/index.js";
import { environmentId, machineIdentityId, organizationId, projectId } from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_ENV_A_ID,
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
  TEST_PROJECT_A_ID,
  TEST_PROJECT_B_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const TEST_MACHINE_A_ID = "mach_00000000000000000000000001";
const TEST_MACHINE_B_ID = "mach_00000000000000000000000002";
const TEST_MACHINE_MEM_A_ID = "mem_00000000000000000000000004";
const TEST_MACHINE_MEM_B_ID = "mem_00000000000000000000000005";

describeIntegration("resolveEffectiveAccess for machine actors (tenant-scoped store)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();

    const orgA = organizationId.brand(TEST_ORG_A_ID);
    await withTenantScope({ kind: "organization", organizationId: orgA }, async (sql) => {
      await sql`
        INSERT INTO machine_identities (id, org_id, display_name)
        VALUES (${TEST_MACHINE_A_ID}, ${TEST_ORG_A_ID}, ${"CI deploy identity"})
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
          ${TEST_MACHINE_MEM_A_ID},
          ${TEST_ORG_A_ID},
          ${TEST_MACHINE_A_ID},
          ${TEST_PROJECT_A_ID},
          ${sql.array(
            [
              AUTHORIZATION_SCOPES.runtimeInjectionRun,
              AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue,
              AUTHORIZATION_SCOPES.approvalApprove,
            ],
            "text",
          )}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    });

    const orgB = organizationId.brand(TEST_ORG_B_ID);
    await withTenantScope({ kind: "organization", organizationId: orgB }, async (sql) => {
      await sql`
        INSERT INTO machine_identities (id, org_id, display_name)
        VALUES (${TEST_MACHINE_B_ID}, ${TEST_ORG_B_ID}, ${"Org B machine identity"})
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
          ${TEST_MACHINE_MEM_B_ID},
          ${TEST_ORG_B_ID},
          ${TEST_MACHINE_B_ID},
          ${TEST_PROJECT_B_ID},
          ${sql.array([AUTHORIZATION_SCOPES.runtimeInjectionRun], "text")}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    });
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("resolves intersected runtime injection scopes for a machine credential", async () => {
    const actor = {
      type: "machine" as const,
      machineIdentityId: machineIdentityId.brand(TEST_MACHINE_A_ID),
      tokenScope: {
        organizationId: organizationId.brand(TEST_ORG_A_ID),
        projectId: projectId.brand(TEST_PROJECT_A_ID),
        environmentId: environmentId.brand(TEST_ENV_A_ID),
      },
      credentialScopes: [
        CREDENTIAL_SCOPES.runtimeInjectionRun,
        CREDENTIAL_SCOPES.runtimeInjectionGrantIssue,
      ],
    };

    const result = await resolveEffectiveAccess(actor, {
      organizationId: organizationId.brand(TEST_ORG_A_ID),
      projectId: projectId.brand(TEST_PROJECT_A_ID),
      environmentId: environmentId.brand(TEST_ENV_A_ID),
    });

    expect(hasAuthorizationScope(result, AUTHORIZATION_SCOPES.runtimeInjectionRun)).toBe(true);
    expect(hasAuthorizationScope(result, AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue)).toBe(
      true,
    );
    expect(hasAuthorizationScope(result, AUTHORIZATION_SCOPES.approvalApprove)).toBe(false);
  });

  it("returns empty scopes when accessing another organization coordinate", async () => {
    const actor = {
      type: "machine" as const,
      machineIdentityId: machineIdentityId.brand(TEST_MACHINE_A_ID),
      tokenScope: {
        organizationId: organizationId.brand(TEST_ORG_B_ID),
        projectId: projectId.brand(TEST_PROJECT_B_ID),
      },
      credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
    };

    const result = await resolveEffectiveAccess(actor, {
      organizationId: organizationId.brand(TEST_ORG_B_ID),
      projectId: projectId.brand(TEST_PROJECT_B_ID),
    });

    expect(result.scopes).toEqual([]);
  });

  it("returns empty scopes for cross-project access within the same organization", async () => {
    const actor = {
      type: "machine" as const,
      machineIdentityId: machineIdentityId.brand(TEST_MACHINE_A_ID),
      tokenScope: {
        organizationId: organizationId.brand(TEST_ORG_A_ID),
        projectId: projectId.brand(TEST_PROJECT_B_ID),
      },
      credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
    };

    const result = await resolveEffectiveAccess(actor, {
      organizationId: organizationId.brand(TEST_ORG_A_ID),
      projectId: projectId.brand(TEST_PROJECT_B_ID),
    });

    expect(result.scopes).toEqual([]);
  });
});
