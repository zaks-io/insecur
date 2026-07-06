import { organizationId, projectId } from "@insecur/domain";
import { afterAll, beforeAll, expect, it } from "vitest";

import { closeRuntimeSql, withTenantScope } from "../../src/index.js";
import { TenantEnvironmentLifecycleStore } from "../../src/environments/tenant-environment-lifecycle-store.js";
import { TenantProjectMetadataStore } from "../../src/projects/tenant-project-metadata-store.js";
import { TenantSecretMatrixMetadataStore } from "../../src/secrets/tenant-secret-matrix-metadata-store.js";
import { describeRls, getRuntimeDatabaseUrl } from "./describe-rls.js";
import { seedTenantBaseline } from "./seed.js";
import { TEST_ORG_A_ID, TEST_ORG_B_ID, TEST_PROJECT_A_ID, TEST_PROJECT_B_ID } from "./test-ids.js";

const runtimeUrl = getRuntimeDatabaseUrl();

describeRls("project and environment metadata reads (real Postgres)", () => {
  beforeAll(async () => {
    if (!runtimeUrl) {
      return;
    }
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("scopes project metadata reads to the current organization", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);
    const rows = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ db }) => new TenantProjectMetadataStore(db).listByOrganization(orgA),
    );

    expect(rows.map((row) => row.projectId)).toEqual([projectId.brand(TEST_PROJECT_A_ID)]);
  });

  it("does not return another organization's projects when guessing opaque IDs", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);
    const rows = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ db }) => new TenantProjectMetadataStore(db).listByOrganization(orgA),
    );

    expect(rows.some((row) => row.projectId === projectId.brand(TEST_PROJECT_B_ID))).toBe(false);
    expect(rows.some((row) => row.organizationId === organizationId.brand(TEST_ORG_B_ID))).toBe(
      false,
    );
  });

  it("scopes environment metadata reads to the current organization and project", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);
    const projectA = projectId.brand(TEST_PROJECT_A_ID);
    const rows = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ db }) => new TenantEnvironmentLifecycleStore(db).listByProject(orgA, projectA),
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgA && row.projectId === projectA)).toBe(
      true,
    );
    expect(rows.every((row) => typeof row.isProtected === "boolean")).toBe(true);
  });

  it("returns no environments for a project outside the scoped organization", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);
    const projectB = projectId.brand(TEST_PROJECT_B_ID);
    const rows = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ db }) => new TenantEnvironmentLifecycleStore(db).listByProject(orgA, projectB),
    );

    expect(rows).toEqual([]);
  });

  it("scopes secret matrix metadata reads to the current organization and project", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);
    const projectA = projectId.brand(TEST_PROJECT_A_ID);
    const rows = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ db }) =>
        new TenantSecretMatrixMetadataStore(db).listByProject({
          organizationId: orgA,
          projectId: projectA,
        }),
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.secretId.startsWith("sec_"))).toBe(true);
    expect(rows.every((row) => row.secretVersionId.startsWith("sv_"))).toBe(true);
    expect(rows.every((row) => row.versionNumber >= 1)).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/ciphertext|valueUtf8|wrapped/i);
  });

  it("returns no secret matrix rows for a project outside the scoped organization", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);
    const projectB = projectId.brand(TEST_PROJECT_B_ID);
    const rows = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ db }) =>
        new TenantSecretMatrixMetadataStore(db).listByProject({
          organizationId: orgA,
          projectId: projectB,
        }),
    );

    expect(rows).toEqual([]);
  });
});
