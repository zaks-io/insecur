import { brandOpaqueResourceIdForPrefix, organizationId, projectId } from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requireDatabaseUrl } from "../../scripts/lib/env-local.mjs";
import { TenantSensitiveMetadataStore, closeRuntimeSql, withTenantScope } from "../../src/index.js";
import { seedTenantBaseline } from "./seed.js";
import { TEST_ORG_A_ID, TEST_PROJECT_A_ID } from "./test-ids.js";

let runtimeUrl: string | undefined;
try {
  runtimeUrl = requireDatabaseUrl("DATABASE_URL_RUNTIME");
} catch {
  runtimeUrl = undefined;
}

const describeRls = runtimeUrl ? describe : describe.skip;

const METADATA_TYPE = "approval.context_note";
const FIELD_KEY = "body";
const RECORD_RESOURCE_ID = brandOpaqueResourceIdForPrefix("aud", "aud_00000000000000000000000001");

function syntheticOrgScopedWrapped() {
  return {
    organizationDataKeyVersion: 1,
    projectDataKeyVersion: null,
    ciphertext: new Uint8Array([0x01, 0x0a]),
  };
}

function syntheticProjectScopedWrapped() {
  return {
    organizationDataKeyVersion: 1,
    projectDataKeyVersion: 1,
    ciphertext: new Uint8Array([0x02, 0x0b]),
  };
}

describeRls("TenantSensitiveMetadataStore scope disambiguation (real Postgres)", () => {
  beforeAll(async () => {
    if (!runtimeUrl) {
      return;
    }
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("returns the org-scoped or project-scoped row matching scopeProjectId when both coexist", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    const project = projectId.brand(TEST_PROJECT_A_ID);

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ db }) => {
      const store = new TenantSensitiveMetadataStore(db);
      await store.upsertField({
        organizationId: org,
        scopeProjectId: "",
        metadataType: METADATA_TYPE,
        recordResourceId: RECORD_RESOURCE_ID,
        fieldKey: FIELD_KEY,
        wrapped: syntheticOrgScopedWrapped(),
      });
      await store.upsertField({
        organizationId: org,
        scopeProjectId: project,
        metadataType: METADATA_TYPE,
        recordResourceId: RECORD_RESOURCE_ID,
        fieldKey: FIELD_KEY,
        wrapped: syntheticProjectScopedWrapped(),
      });
    });

    const orgScoped = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ db }) =>
        new TenantSensitiveMetadataStore(db).getField({
          organizationId: org,
          scopeProjectId: "",
          metadataType: METADATA_TYPE,
          recordResourceId: RECORD_RESOURCE_ID,
          fieldKey: FIELD_KEY,
        }),
    );
    const projectScoped = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ db }) =>
        new TenantSensitiveMetadataStore(db).getField({
          organizationId: org,
          scopeProjectId: project,
          metadataType: METADATA_TYPE,
          recordResourceId: RECORD_RESOURCE_ID,
          fieldKey: FIELD_KEY,
        }),
    );

    expect(orgScoped).not.toBeNull();
    expect(orgScoped?.scopeProjectId).toBeNull();
    expect(orgScoped?.wrapped.organizationDataKeyVersion).toBe(1);
    expect(orgScoped?.wrapped.projectDataKeyVersion).toBeNull();
    expect(orgScoped?.wrapped.ciphertext).toEqual(new Uint8Array([0x01, 0x0a]));

    expect(projectScoped).not.toBeNull();
    expect(projectScoped?.scopeProjectId).toBe(project);
    expect(projectScoped?.wrapped.organizationDataKeyVersion).toBe(1);
    expect(projectScoped?.wrapped.projectDataKeyVersion).toBe(1);
    expect(projectScoped?.wrapped.ciphertext).toEqual(new Uint8Array([0x02, 0x0b]));
  });
});
