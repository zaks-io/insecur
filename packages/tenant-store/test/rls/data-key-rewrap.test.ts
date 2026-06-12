import { organizationId, projectId } from "@insecur/domain";
import {
  Keyring,
  MetadataTenantDataKeySource,
  unwrapOrganizationDataKeyBytes,
  unwrapProjectDataKeyBytes,
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

  it("rewraps scoped tenant keys across root versions without touching other tenants", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);
    const orgB = organizationId.brand(TEST_ORG_B_ID);
    const projectA = projectId.brand(TEST_PROJECT_A_ID);
    const rootProvider = versionedRootProvider({
      1: RLS_TEST_ROOT_KEY_BYTES,
      2: RLS_TEST_ROOT_V2_BYTES,
      3: RLS_TEST_ROOT_V3_BYTES,
    });

    const orgBBefore = await withTenantScope(
      { kind: "organization", organizationId: orgB },
      async ({ db }) => {
        const store = new TenantDataKeyMetadataStore(db);
        const key = await store.getActiveOrganizationDataKey(orgB);
        if (!key?.wrappedStorageRef) {
          throw new Error("expected org B organization data key to be provisioned");
        }
        expect(key.rootKeyVersion).toBe(1);
        return key;
      },
    );
    const orgBBytesBefore = await unwrapOrganizationDataKeyBytes(
      RLS_TEST_ROOT_KEY_BYTES,
      orgBBefore.wrappedStorageRef,
      { organizationId: orgB, keyVersion: orgBBefore.keyVersion },
    );

    const orgABeforeV2 = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ db }) => {
        const store = new TenantDataKeyMetadataStore(db);
        const key = await store.getActiveOrganizationDataKey(orgA);
        if (!key?.wrappedStorageRef) {
          throw new Error("expected org A organization data key to be provisioned");
        }
        expect(key.rootKeyVersion).toBe(1);
        expect(key.wrappedStorageRef).toMatch(/^inline:b64:/);
        return key;
      },
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

    const orgAAfterV2 = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ db }) => {
        const store = new TenantDataKeyMetadataStore(db);
        return store.getActiveOrganizationDataKey(orgA);
      },
    );
    expect(orgAAfterV2?.rootKeyVersion).toBe(2);
    if (!orgAAfterV2?.wrappedStorageRef) {
      throw new Error("expected org A wrapped ref after v1→v2 rewrap");
    }
    const orgABytesAfterV2 = await unwrapOrganizationDataKeyBytes(
      RLS_TEST_ROOT_V2_BYTES,
      orgAAfterV2.wrappedStorageRef,
      { organizationId: orgA, keyVersion: orgAAfterV2.keyVersion },
    );
    const orgABytesBeforeV2 = await unwrapOrganizationDataKeyBytes(
      RLS_TEST_ROOT_KEY_BYTES,
      orgABeforeV2.wrappedStorageRef,
      { organizationId: orgA, keyVersion: orgABeforeV2.keyVersion },
    );
    expect(orgABytesAfterV2).toEqual(orgABytesBeforeV2);

    const orgBAfterV2 = await withTenantScope(
      { kind: "organization", organizationId: orgB },
      async ({ db }) => {
        const store = new TenantDataKeyMetadataStore(db);
        return store.getActiveOrganizationDataKey(orgB);
      },
    );
    expect(orgBAfterV2?.rootKeyVersion).toBe(1);
    expect(orgBAfterV2?.wrappedStorageRef).toBe(orgBBefore.wrappedStorageRef);
    if (!orgBAfterV2?.wrappedStorageRef) {
      throw new Error("expected org B wrapped ref after org-A rewrap");
    }
    const orgBBytesAfterV2 = await unwrapOrganizationDataKeyBytes(
      RLS_TEST_ROOT_KEY_BYTES,
      orgBAfterV2.wrappedStorageRef,
      { organizationId: orgB, keyVersion: orgBAfterV2.keyVersion },
    );
    expect(orgBBytesAfterV2).toEqual(orgBBytesBefore);

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

    const orgAAfterV3 = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ db }) => {
        const store = new TenantDataKeyMetadataStore(db);
        return store.getActiveOrganizationDataKey(orgA);
      },
    );
    expect(orgAAfterV3?.rootKeyVersion).toBe(3);
    if (!orgAAfterV3?.wrappedStorageRef) {
      throw new Error("expected org A wrapped ref after v2→v3 rewrap");
    }
    const orgABytesAfterV3 = await unwrapOrganizationDataKeyBytes(
      RLS_TEST_ROOT_V3_BYTES,
      orgAAfterV3.wrappedStorageRef,
      { organizationId: orgA, keyVersion: orgAAfterV3.keyVersion },
    );
    expect(orgABytesAfterV3).toEqual(orgABytesBeforeV2);

    const projectAAfterV3 = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ db }) => {
        const store = new TenantDataKeyMetadataStore(db);
        return store.getActiveProjectDataKey(orgA, projectA);
      },
    );
    expect(projectAAfterV3?.id).toBe(TEST_PROJECT_KEY_A_ID);
    expect(projectAAfterV3?.wrappedStorageRef).toMatch(/^inline:b64:/);
    if (!projectAAfterV3?.wrappedStorageRef) {
      throw new Error("expected project A wrapped ref after v2→v3 rewrap");
    }
    const projectBytesAfterV3 = await unwrapProjectDataKeyBytes(
      RLS_TEST_ROOT_V3_BYTES,
      projectAAfterV3.wrappedStorageRef,
      {
        organizationId: orgA,
        projectId: projectA,
        keyVersion: projectAAfterV3.keyVersion,
      },
    );
    expect(projectBytesAfterV3).toHaveLength(32);
  });
});
