import { organizationId, projectId } from "@insecur/domain";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  listOrganizationDataKeys,
  listProjectDataKeys,
  updateOrganizationDataKeyWrap,
  updateOrganizationDataKeyWrapIfNull,
  updateProjectDataKeyWrap,
  updateProjectDataKeyWrapIfNull,
} from "../src/data-keys/data-key-rewrap-store.js";
import {
  TEST_ORG_A_ID,
  TEST_ORG_KEY_A_ID,
  TEST_PROJECT_A_ID,
  TEST_PROJECT_KEY_A_ID,
} from "./rls/test-ids.js";
import { createMockTenantDb } from "./helpers/mock-tenant-db.js";

const ORG = organizationId.brand(TEST_ORG_A_ID);
const PROJECT = projectId.brand(TEST_PROJECT_A_ID);

const ORG_KEY_ROW = {
  id: TEST_ORG_KEY_A_ID,
  org_id: TEST_ORG_A_ID,
  key_version: 2,
  status: "active" as const,
  root_key_version: 1,
  wrapped_storage_ref: "inline:b64:synthetic-org-wrap",
  custody_evidence_ref: null,
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  updated_at: new Date("2026-01-02T00:00:00.000Z"),
};

const PROJECT_KEY_ROW = {
  id: TEST_PROJECT_KEY_A_ID,
  org_id: TEST_ORG_A_ID,
  project_id: TEST_PROJECT_A_ID,
  key_version: 2,
  status: "retired" as const,
  organization_data_key_version: 1,
  wrapped_storage_ref: "inline:b64:synthetic-project-wrap",
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  updated_at: new Date("2026-01-02T00:00:00.000Z"),
};

function whereSql(where: unknown): string {
  return new PgDialect().sqlToQuery(where as never).sql;
}

function expectsWrappedRefNullCheck(sql: string): boolean {
  return sql.includes('"wrapped_storage_ref" is null');
}

describe("data-key rewrap store", () => {
  it("listOrganizationDataKeys maps selected rows through organization metadata", async () => {
    const { db } = createMockTenantDb({ selectResults: [[ORG_KEY_ROW]] });

    const rows = await listOrganizationDataKeys(db, ORG);

    expect(rows).toEqual([
      {
        id: TEST_ORG_KEY_A_ID,
        organizationId: ORG,
        keyVersion: 2,
        status: "active",
        rootKeyVersion: 1,
        wrappedStorageRef: "inline:b64:synthetic-org-wrap",
        custodyEvidenceRef: null,
      },
    ]);
  });

  it("listProjectDataKeys maps selected rows through project metadata", async () => {
    const { db } = createMockTenantDb({ selectResults: [[PROJECT_KEY_ROW]] });

    const rows = await listProjectDataKeys(db, ORG);

    expect(rows).toEqual([
      {
        id: TEST_PROJECT_KEY_A_ID,
        organizationId: ORG,
        projectId: PROJECT,
        keyVersion: 2,
        status: "retired",
        organizationDataKeyVersion: 1,
        wrappedStorageRef: "inline:b64:synthetic-project-wrap",
      },
    ]);
  });

  it("updateOrganizationDataKeyWrap sets wrap metadata without a null-ref predicate", async () => {
    const { db, updateSets, updateWheres } = createMockTenantDb();

    await updateOrganizationDataKeyWrap(db, {
      organizationId: ORG,
      keyVersion: 2,
      wrappedStorageRef: "inline:b64:updated-org-wrap",
      rootKeyVersion: 3,
      status: "retired",
    });

    expect(updateSets).toHaveLength(1);
    expect(updateSets[0]).toMatchObject({
      wrappedStorageRef: "inline:b64:updated-org-wrap",
      rootKeyVersion: 3,
      status: "retired",
    });
    expect(updateSets[0]?.updatedAt).toBeInstanceOf(Date);
    expect(updateWheres).toHaveLength(1);
    const sql = whereSql(updateWheres[0]);
    expect(sql).toContain('"organization_data_keys"."org_id" = $1');
    expect(sql).toContain('"organization_data_keys"."key_version" = $2');
    expect(expectsWrappedRefNullCheck(sql)).toBe(false);
  });

  it("updateOrganizationDataKeyWrapIfNull adds a null wrapped-ref predicate", async () => {
    const { db, updateWheres } = createMockTenantDb();

    await updateOrganizationDataKeyWrapIfNull(db, ORG, 2, {
      wrappedStorageRef: "inline:b64:race-safe-org-wrap",
      rootKeyVersion: 3,
      status: "active",
    });

    expect(updateWheres).toHaveLength(1);
    expect(expectsWrappedRefNullCheck(whereSql(updateWheres[0]))).toBe(true);
  });

  it("updateOrganizationDataKeyWrap honors onlyIfWrappedRefNull when set explicitly", async () => {
    const { db, updateWheres } = createMockTenantDb();

    await updateOrganizationDataKeyWrap(db, {
      organizationId: ORG,
      keyVersion: 2,
      wrappedStorageRef: "inline:b64:explicit-null-guard",
      rootKeyVersion: 4,
      status: "active",
      onlyIfWrappedRefNull: true,
    });

    expect(expectsWrappedRefNullCheck(whereSql(updateWheres[0]))).toBe(true);
  });

  it("updateProjectDataKeyWrap sets wrap metadata and optional organization data-key version", async () => {
    const { db, updateSets, updateWheres } = createMockTenantDb();

    await updateProjectDataKeyWrap(db, {
      organizationId: ORG,
      projectId: PROJECT,
      keyVersion: 2,
      wrappedStorageRef: "inline:b64:updated-project-wrap",
      organizationDataKeyVersion: 4,
      status: "active",
    });

    expect(updateSets).toHaveLength(1);
    expect(updateSets[0]).toMatchObject({
      wrappedStorageRef: "inline:b64:updated-project-wrap",
      organizationDataKeyVersion: 4,
      status: "active",
    });
    expect(updateSets[0]?.updatedAt).toBeInstanceOf(Date);
    const sql = whereSql(updateWheres[0]);
    expect(sql).toContain('"project_data_keys"."org_id" = $1');
    expect(sql).toContain('"project_data_keys"."project_id" = $2');
    expect(sql).toContain('"project_data_keys"."key_version" = $3');
    expect(expectsWrappedRefNullCheck(sql)).toBe(false);
  });

  it("updateProjectDataKeyWrap omits organization data-key version when not provided", async () => {
    const { db, updateSets } = createMockTenantDb();

    await updateProjectDataKeyWrap(db, {
      organizationId: ORG,
      projectId: PROJECT,
      keyVersion: 2,
      wrappedStorageRef: "inline:b64:status-only-wrap",
      status: "revoked",
    });

    expect(updateSets[0]).toMatchObject({
      wrappedStorageRef: "inline:b64:status-only-wrap",
      status: "revoked",
    });
    expect(updateSets[0]).not.toHaveProperty("organizationDataKeyVersion");
  });

  it("updateProjectDataKeyWrapIfNull adds a null wrapped-ref predicate", async () => {
    const { db, updateWheres } = createMockTenantDb();

    await updateProjectDataKeyWrapIfNull(db, {
      organizationId: ORG,
      projectId: PROJECT,
      keyVersion: 2,
      wrappedStorageRef: "inline:b64:race-safe-project-wrap",
      organizationDataKeyVersion: 4,
      status: "active",
    });

    expect(updateWheres).toHaveLength(1);
    expect(expectsWrappedRefNullCheck(whereSql(updateWheres[0]))).toBe(true);
  });

  it("updateProjectDataKeyWrap honors onlyIfWrappedRefNull when set explicitly", async () => {
    const { db, updateWheres } = createMockTenantDb();

    await updateProjectDataKeyWrap(db, {
      organizationId: ORG,
      projectId: PROJECT,
      keyVersion: 2,
      wrappedStorageRef: "inline:b64:explicit-project-null-guard",
      organizationDataKeyVersion: 4,
      status: "active",
      onlyIfWrappedRefNull: true,
    });

    expect(expectsWrappedRefNullCheck(whereSql(updateWheres[0]))).toBe(true);
  });
});
