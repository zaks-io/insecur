import { organizationId, projectId } from "@insecur/domain";
import {
  checkTenantDataKeyReadiness,
  StaticRootKeyProvider,
  type TenantDataKeyMetadataReader,
} from "@insecur/crypto";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { TenantDataKeyMetadataStore, closeRuntimeSql, withTenantScope } from "../../src/index.js";
import { describeRls, getRuntimeDatabaseUrl } from "./describe-rls.js";
import { seedMutationTenant, seedTenantBaseline } from "./seed.js";
import {
  TEST_ENV_D_ID,
  TEST_MEM_D_ID,
  TEST_ORG_D_ID,
  TEST_ORG_KEY_D_ID,
  TEST_PROJECT_D_ID,
  TEST_PROJECT_KEY_D_ID,
  TEST_TEAM_D_ID,
} from "./test-ids.js";

const runtimeUrl = getRuntimeDatabaseUrl();

class StoreBackedMetadataReader implements TenantDataKeyMetadataReader {
  constructor(private readonly organizationId: ReturnType<typeof organizationId.brand>) {}

  private withStore<T>(run: (store: TenantDataKeyMetadataStore) => Promise<T>): Promise<T> {
    return withTenantScope(
      { kind: "organization", organizationId: this.organizationId },
      async ({ db }) => run(new TenantDataKeyMetadataStore(db)),
    );
  }

  getActiveOrganizationDataKey(orgId: typeof this.organizationId) {
    return this.withStore((store) => store.getActiveOrganizationDataKey(orgId));
  }

  getOrganizationDataKeyVersion(orgId: typeof this.organizationId, keyVersion: number) {
    return this.withStore((store) => store.getOrganizationDataKeyVersion(orgId, keyVersion));
  }

  getActiveProjectDataKey(
    orgId: typeof this.organizationId,
    projId: ReturnType<typeof projectId.brand>,
  ) {
    return this.withStore((store) => store.getActiveProjectDataKey(orgId, projId));
  }

  getProjectDataKeyVersion(
    orgId: typeof this.organizationId,
    projId: ReturnType<typeof projectId.brand>,
    keyVersion: number,
  ) {
    return this.withStore((store) => store.getProjectDataKeyVersion(orgId, projId, keyVersion));
  }

  getOrganizationDataKeyForReadiness(orgId: typeof this.organizationId) {
    return this.withStore((store) => store.getOrganizationDataKeyForReadiness(orgId));
  }

  getProjectDataKeyForReadiness(
    orgId: typeof this.organizationId,
    projId: ReturnType<typeof projectId.brand>,
  ) {
    return this.withStore((store) => store.getProjectDataKeyForReadiness(orgId, projId));
  }
}

// Mutates the dedicated mutation tenant (org D) only. `seedTenantBaseline` never seeds D, so a
// concurrent cross-package re-seed cannot flip these statuses back mid-test.
async function retireReadinessFixtureDataKeys(
  orgD: ReturnType<typeof organizationId.brand>,
): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: orgD }, async ({ sql }) => {
    await sql`
      UPDATE organization_data_keys
      SET status = ${"retired"}
      WHERE org_id = ${TEST_ORG_D_ID}
        AND id = ${TEST_ORG_KEY_D_ID}
    `;
    await sql`
      UPDATE project_data_keys
      SET status = ${"revoked"}
      WHERE org_id = ${TEST_ORG_D_ID}
        AND id = ${TEST_PROJECT_KEY_D_ID}
    `;
  });
}

async function restoreReadinessFixtureDataKeys(
  orgD: ReturnType<typeof organizationId.brand>,
): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: orgD }, async ({ sql }) => {
    await sql`
      UPDATE organization_data_keys
      SET status = ${"active"}
      WHERE org_id = ${TEST_ORG_D_ID}
        AND id = ${TEST_ORG_KEY_D_ID}
    `;
    await sql`
      UPDATE project_data_keys
      SET status = ${"active"}
      WHERE org_id = ${TEST_ORG_D_ID}
        AND id = ${TEST_PROJECT_KEY_D_ID}
    `;
  });
}

async function expectInactiveReadinessReport(
  reader: StoreBackedMetadataReader,
  orgD: ReturnType<typeof organizationId.brand>,
  projectD: ReturnType<typeof projectId.brand>,
): Promise<void> {
  const readinessRow = await reader.getOrganizationDataKeyForReadiness(orgD);
  expect(readinessRow?.status).toBe("retired");
  expect(await reader.getActiveOrganizationDataKey(orgD)).toBeNull();

  const projectReadinessRow = await reader.getProjectDataKeyForReadiness(orgD, projectD);
  expect(projectReadinessRow?.status).toBe("revoked");

  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  const report = await checkTenantDataKeyReadiness({
    organizationId: orgD,
    projectId: projectD,
    metadata: reader,
    rootKeyProvider: new StaticRootKeyProvider(root),
  });

  const codes = report.issues.map((issue) => issue.code);
  expect(report.status).toBe("not_ready");
  expect(codes).toContain("organization_data_key.inactive");
  expect(codes).toContain("project_data_key.inactive");
  expect(codes).not.toContain("organization_data_key.missing");
  expect(codes).not.toContain("project_data_key.missing");
}

describeRls("tenant data key readiness (real Postgres store)", () => {
  const orgD = organizationId.brand(TEST_ORG_D_ID);
  const projectD = projectId.brand(TEST_PROJECT_D_ID);

  beforeAll(async () => {
    if (!runtimeUrl) {
      return;
    }
    await seedTenantBaseline();
    await seedMutationTenant({
      organizationId: TEST_ORG_D_ID,
      projectId: TEST_PROJECT_D_ID,
      environmentId: TEST_ENV_D_ID,
      teamId: TEST_TEAM_D_ID,
      membershipId: TEST_MEM_D_ID,
      organizationDataKeyId: TEST_ORG_KEY_D_ID,
      projectDataKeyId: TEST_PROJECT_KEY_D_ID,
    });
  });

  afterEach(async () => {
    if (!runtimeUrl) {
      return;
    }
    await restoreReadinessFixtureDataKeys(orgD);
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("reports inactive (not missing) when only retired organization keys exist", async () => {
    const reader = new StoreBackedMetadataReader(orgD);

    await retireReadinessFixtureDataKeys(orgD);
    await expectInactiveReadinessReport(reader, orgD, projectD);
  });
});
