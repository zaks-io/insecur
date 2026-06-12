import { organizationId, projectId } from "@insecur/domain";
import {
  Keyring,
  MetadataTenantDataKeySource,
  unwrapOrganizationDataKeyBytes,
} from "@insecur/crypto";
import { afterAll, beforeAll, expect, it } from "vitest";

import { TenantDataKeyMetadataStore, closeRuntimeSql, withTenantScope } from "../../src/index.js";
import { describeRls } from "./describe-rls.js";
import { seedTenantBaseline } from "./seed.js";
import {
  RLS_TEST_ROOT_KEY_BYTES,
  RLS_TEST_ROOT_V2_BYTES,
  RLS_TEST_ROOT_V3_BYTES,
} from "./test-root-key.js";
import {
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
  TEST_PROJECT_A_ID,
  TEST_PROJECT_KEY_A_ID,
} from "./test-ids.js";

function versionedRootProvider(versions: Readonly<Record<number, Uint8Array>>): {
  getRootKeyBytes(version: number): Promise<Uint8Array>;
} {
  return {
    getRootKeyBytes(version: number): Promise<Uint8Array> {
      const bytes = versions[version];
      if (!bytes) {
        return Promise.reject(new Error("missing root version"));
      }
      return Promise.resolve(bytes);
    },
  };
}

describeRls("tenant data key root rewrap (real Postgres)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("does not rewrap another tenant's keys when scoped to organization A", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);
    const orgB = organizationId.brand(TEST_ORG_B_ID);
    const rootProvider = versionedRootProvider({
      1: RLS_TEST_ROOT_KEY_BYTES,
      2: RLS_TEST_ROOT_V2_BYTES,
    });

    const orgBBefore = await withTenantScope(
      { kind: "organization", organizationId: orgB },
      async ({ db }) => {
        const store = new TenantDataKeyMetadataStore(db);
        const key = await store.getActiveOrganizationDataKey(orgB);
        if (!key?.wrappedStorageRef) {
          throw new Error("expected org B organization data key to be provisioned");
        }
        return key;
      },
    );
    expect(orgBBefore.rootKeyVersion).toBe(1);
    const orgBBytesBefore = await unwrapOrganizationDataKeyBytes(
      RLS_TEST_ROOT_KEY_BYTES,
      orgBBefore.wrappedStorageRef,
      { organizationId: orgB, keyVersion: orgBBefore.keyVersion },
    );

    await withTenantScope({ kind: "organization", organizationId: orgA }, async ({ db }) => {
      const store = new TenantDataKeyMetadataStore(db);
      const ring = new Keyring(rootProvider, new MetadataTenantDataKeySource(store));
      await ring.rewrapTenantDataKeys({
        organizationId: orgA,
        oldRootVersion: 1,
        newRootVersion: 2,
        store,
      });
    });

    const orgAAfter = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ db }) => {
        const store = new TenantDataKeyMetadataStore(db);
        return store.getActiveOrganizationDataKey(orgA);
      },
    );
    expect(orgAAfter?.rootKeyVersion).toBe(2);

    const orgBAfter = await withTenantScope(
      { kind: "organization", organizationId: orgB },
      async ({ db }) => {
        const store = new TenantDataKeyMetadataStore(db);
        return store.getActiveOrganizationDataKey(orgB);
      },
    );
    expect(orgBAfter?.rootKeyVersion).toBe(1);
    expect(orgBAfter?.wrappedStorageRef).toBe(orgBBefore.wrappedStorageRef);
    if (!orgBAfter?.wrappedStorageRef) {
      throw new Error("expected org B wrapped ref after org-A rewrap");
    }
    const orgBBytesAfter = await unwrapOrganizationDataKeyBytes(
      RLS_TEST_ROOT_KEY_BYTES,
      orgBAfter.wrappedStorageRef,
      { organizationId: orgB, keyVersion: orgBAfter.keyVersion },
    );
    expect(orgBBytesAfter).toEqual(orgBBytesBefore);
  });

  it("rewraps organization and project keys under a new root without changing data key bytes", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);
    const projectA = projectId.brand(TEST_PROJECT_A_ID);
    const rootProvider = versionedRootProvider({
      1: RLS_TEST_ROOT_KEY_BYTES,
      2: RLS_TEST_ROOT_V2_BYTES,
      3: RLS_TEST_ROOT_V3_BYTES,
    });

    const beforeOrgKey = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ db }) => {
        const store = new TenantDataKeyMetadataStore(db);
        return store.getActiveOrganizationDataKey(orgA);
      },
    );
    expect(beforeOrgKey?.wrappedStorageRef).toMatch(/^inline:b64:/);
    expect(beforeOrgKey?.rootKeyVersion).toBe(2);
    if (!beforeOrgKey?.wrappedStorageRef) {
      throw new Error("expected seeded organization wrapped ref");
    }
    const beforeBytes = await unwrapOrganizationDataKeyBytes(
      RLS_TEST_ROOT_V2_BYTES,
      beforeOrgKey.wrappedStorageRef,
      { organizationId: orgA, keyVersion: beforeOrgKey.keyVersion },
    );

    await withTenantScope({ kind: "organization", organizationId: orgA }, async ({ db }) => {
      const store = new TenantDataKeyMetadataStore(db);
      const ring = new Keyring(rootProvider, new MetadataTenantDataKeySource(store));
      await ring.rewrapTenantDataKeys({
        organizationId: orgA,
        oldRootVersion: 2,
        newRootVersion: 3,
        store,
      });
    });

    const afterOrgKey = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ db }) => {
        const store = new TenantDataKeyMetadataStore(db);
        return store.getActiveOrganizationDataKey(orgA);
      },
    );
    expect(afterOrgKey?.rootKeyVersion).toBe(3);
    if (!afterOrgKey?.wrappedStorageRef) {
      throw new Error("expected rewrapped organization wrapped ref");
    }
    const afterBytes = await unwrapOrganizationDataKeyBytes(
      RLS_TEST_ROOT_V3_BYTES,
      afterOrgKey.wrappedStorageRef,
      { organizationId: orgA, keyVersion: afterOrgKey.keyVersion },
    );
    expect(afterBytes).toEqual(beforeBytes);

    const afterProjectKey = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ db }) => {
        const store = new TenantDataKeyMetadataStore(db);
        return store.getActiveProjectDataKey(orgA, projectA);
      },
    );
    expect(afterProjectKey?.id).toBe(TEST_PROJECT_KEY_A_ID);
    expect(afterProjectKey?.wrappedStorageRef).toMatch(/^inline:b64:/);
  });
});
