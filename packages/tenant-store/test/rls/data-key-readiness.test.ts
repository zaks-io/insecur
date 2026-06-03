import { organizationId, projectId } from "@insecur/domain";
import {
  checkTenantDataKeyReadiness,
  StaticRootKeyProvider,
  type TenantDataKeyMetadataReader,
} from "@insecur/crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { requireDatabaseUrl } from "../../scripts/lib/env-local.mjs";
import { TenantDataKeyMetadataStore, closeRuntimeSql, withTenantScope } from "../../src/index.js";
import { seedTenantBaseline } from "./seed.js";
import {
  TEST_ORG_B_ID,
  TEST_ORG_KEY_B_ID,
  TEST_PROJECT_B_ID,
  TEST_PROJECT_KEY_B_ID,
} from "./test-ids.js";

let runtimeUrl: string | undefined;
try {
  runtimeUrl = requireDatabaseUrl("DATABASE_URL_RUNTIME");
} catch {
  runtimeUrl = undefined;
}

const describeRls = runtimeUrl ? describe : describe.skip;

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

/** Uses org B data-key rows only; org A seed rows stay active for isolation tests. */
async function retireReadinessFixtureDataKeys(
  orgB: ReturnType<typeof organizationId.brand>,
): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: orgB }, async ({ sql }) => {
    await sql`
      UPDATE organization_data_keys
      SET status = ${"retired"}
      WHERE org_id = ${TEST_ORG_B_ID}
        AND id = ${TEST_ORG_KEY_B_ID}
    `;
    await sql`
      UPDATE project_data_keys
      SET status = ${"revoked"}
      WHERE org_id = ${TEST_ORG_B_ID}
        AND id = ${TEST_PROJECT_KEY_B_ID}
    `;
  });
}

async function restoreReadinessFixtureDataKeys(
  orgB: ReturnType<typeof organizationId.brand>,
): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: orgB }, async ({ sql }) => {
    await sql`
      UPDATE organization_data_keys
      SET status = ${"active"}
      WHERE org_id = ${TEST_ORG_B_ID}
        AND id = ${TEST_ORG_KEY_B_ID}
    `;
    await sql`
      UPDATE project_data_keys
      SET status = ${"active"}
      WHERE org_id = ${TEST_ORG_B_ID}
        AND id = ${TEST_PROJECT_KEY_B_ID}
    `;
  });
}

async function expectInactiveReadinessReport(
  reader: StoreBackedMetadataReader,
  orgB: ReturnType<typeof organizationId.brand>,
  projectB: ReturnType<typeof projectId.brand>,
): Promise<void> {
  const readinessRow = await reader.getOrganizationDataKeyForReadiness(orgB);
  expect(readinessRow?.status).toBe("retired");
  expect(await reader.getActiveOrganizationDataKey(orgB)).toBeNull();

  const projectReadinessRow = await reader.getProjectDataKeyForReadiness(orgB, projectB);
  expect(projectReadinessRow?.status).toBe("revoked");

  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  const report = await checkTenantDataKeyReadiness({
    organizationId: orgB,
    projectId: projectB,
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
  const orgB = organizationId.brand(TEST_ORG_B_ID);
  const projectB = projectId.brand(TEST_PROJECT_B_ID);

  beforeAll(async () => {
    if (!runtimeUrl) {
      return;
    }
    await seedTenantBaseline();
  });

  afterEach(async () => {
    if (!runtimeUrl) {
      return;
    }
    await restoreReadinessFixtureDataKeys(orgB);
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("reports inactive (not missing) when only retired organization keys exist", async () => {
    const reader = new StoreBackedMetadataReader(orgB);

    await retireReadinessFixtureDataKeys(orgB);
    await expectInactiveReadinessReport(reader, orgB, projectB);
  });
});
