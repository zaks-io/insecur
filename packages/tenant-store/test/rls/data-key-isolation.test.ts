import { organizationId, projectId } from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { redactLoggableError, requireDatabaseUrl } from "../../scripts/lib/env-local.mjs";
import { TenantDataKeyMetadataStore, closeRuntimeSql, withTenantScope } from "../../src/index.js";
import { seedTenantBaseline } from "./seed.js";
import {
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
  TEST_ORG_KEY_A_ID,
  TEST_PROJECT_A_ID,
  TEST_PROJECT_B_ID,
  TEST_PROJECT_KEY_A_ID,
} from "./test-ids.js";

let runtimeUrl: string | undefined;
try {
  runtimeUrl = requireDatabaseUrl("DATABASE_URL_RUNTIME");
} catch {
  runtimeUrl = undefined;
}

const describeRls = runtimeUrl ? describe : describe.skip;

describeRls("tenant data key metadata isolation (real Postgres)", () => {
  beforeAll(async () => {
    if (!runtimeUrl) {
      return;
    }
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("returns active organization and project data keys only for the scoped tenant", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);
    const projectA = projectId.brand(TEST_PROJECT_A_ID);

    const organizationKey = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async (sql) => {
        const store = new TenantDataKeyMetadataStore(sql);
        return store.getActiveOrganizationDataKey(orgA);
      },
    );
    const projectKey = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async (sql) => {
        const store = new TenantDataKeyMetadataStore(sql);
        return store.getActiveProjectDataKey(orgA, projectA);
      },
    );

    expect(organizationKey?.id).toBe(TEST_ORG_KEY_A_ID);
    expect(organizationKey?.keyVersion).toBe(1);
    expect(organizationKey?.status).toBe("active");
    expect(organizationKey?.custodyEvidenceRef).toMatch(/^escrow-record:\/\//);
    expect(projectKey?.id).toBe(TEST_PROJECT_KEY_A_ID);
    expect(projectKey?.organizationDataKeyVersion).toBe(1);
  });

  it("blocks cross-tenant organization data key reads when guessing another org id", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);

    const organizationKey = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async (sql) => {
        const store = new TenantDataKeyMetadataStore(sql);
        return store.getOrganizationDataKeyVersion(organizationId.brand(TEST_ORG_B_ID), 1);
      },
    );
    const projectKey = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async (sql) => {
        const store = new TenantDataKeyMetadataStore(sql);
        return store.getActiveProjectDataKey(orgA, projectId.brand(TEST_PROJECT_B_ID));
      },
    );

    expect(organizationKey).toBeNull();
    expect(projectKey).toBeNull();
  });

  it("rejects unscoped reads of data key metadata under the runtime role", async () => {
    if (!runtimeUrl) {
      return;
    }
    let sql;
    try {
      sql = postgres(runtimeUrl, { prepare: false, max: 1 });
    } catch (error) {
      throw new Error(redactLoggableError(error), { cause: error });
    }
    try {
      const organizationKeys = await sql`SELECT id FROM organization_data_keys`;
      const projectKeys = await sql`SELECT id FROM project_data_keys`;
      expect(organizationKeys).toEqual([]);
      expect(projectKeys).toEqual([]);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
