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
import { RLS_TEST_ROOT_KEY_BYTES } from "./test-root-key.js";
import {
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
  TEST_PROJECT_A_ID,
  TEST_PROJECT_KEY_A_ID,
} from "./test-ids.js";

describeRls("tenant data key root rewrap (real Postgres)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("rewraps organization and project keys under a new root without changing data key bytes", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);
    const projectA = projectId.brand(TEST_PROJECT_A_ID);
    const rootV2 = new Uint8Array(32);
    crypto.getRandomValues(rootV2);
    const rootProvider = {
      getRootKeyBytes(version: number): Promise<Uint8Array> {
        if (version === 1) {
          return Promise.resolve(RLS_TEST_ROOT_KEY_BYTES);
        }
        if (version === 2) {
          return Promise.resolve(rootV2);
        }
        return Promise.reject(new Error("missing root version"));
      },
    };

    const beforeOrgKey = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ db }) => {
        const store = new TenantDataKeyMetadataStore(db);
        return store.getActiveOrganizationDataKey(orgA);
      },
    );
    expect(beforeOrgKey?.wrappedStorageRef).toMatch(/^inline:b64:/);
    if (!beforeOrgKey?.wrappedStorageRef) {
      throw new Error("expected seeded organization wrapped ref");
    }
    const beforeBytes = await unwrapOrganizationDataKeyBytes(
      RLS_TEST_ROOT_KEY_BYTES,
      beforeOrgKey.wrappedStorageRef,
      { organizationId: orgA, keyVersion: beforeOrgKey.keyVersion },
    );

    const keyring = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ db }) => {
        const store = new TenantDataKeyMetadataStore(db);
        const metadataSource = new MetadataTenantDataKeySource(store);
        const ring = new Keyring(rootProvider, metadataSource);
        await ring.rewrapTenantDataKeys({
          organizationId: orgA,
          oldRootVersion: 1,
          newRootVersion: 2,
          store,
        });
        return ring;
      },
    );
    void keyring;

    const afterOrgKey = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async ({ db }) => {
        const store = new TenantDataKeyMetadataStore(db);
        return store.getActiveOrganizationDataKey(orgA);
      },
    );
    expect(afterOrgKey?.rootKeyVersion).toBe(2);
    if (!afterOrgKey?.wrappedStorageRef) {
      throw new Error("expected rewrapped organization wrapped ref");
    }
    const afterBytes = await unwrapOrganizationDataKeyBytes(rootV2, afterOrgKey.wrappedStorageRef, {
      organizationId: orgA,
      keyVersion: afterOrgKey.keyVersion,
    });
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

  it("does not rewrap another tenant's keys when scoped to organization A", async () => {
    const orgA = organizationId.brand(TEST_ORG_A_ID);
    const orgB = organizationId.brand(TEST_ORG_B_ID);
    const rootV2 = new Uint8Array(32);
    crypto.getRandomValues(rootV2);
    const versionedRootProvider = {
      getRootKeyBytes(version: number): Promise<Uint8Array> {
        if (version === 1) {
          return Promise.resolve(RLS_TEST_ROOT_KEY_BYTES);
        }
        if (version === 2) {
          return Promise.resolve(rootV2);
        }
        return Promise.reject(new Error("missing root version"));
      },
    };

    await withTenantScope({ kind: "organization", organizationId: orgA }, async ({ db }) => {
      const store = new TenantDataKeyMetadataStore(db);
      const ring = new Keyring(versionedRootProvider, new MetadataTenantDataKeySource(store));
      await ring.rewrapTenantDataKeys({
        organizationId: orgA,
        oldRootVersion: 1,
        newRootVersion: 2,
        store,
      });
    });

    const orgBKey = await withTenantScope(
      { kind: "organization", organizationId: orgB },
      async ({ db }) => {
        const store = new TenantDataKeyMetadataStore(db);
        return store.getActiveOrganizationDataKey(orgB);
      },
    );
    expect(orgBKey?.rootKeyVersion).toBe(1);
  });
});
