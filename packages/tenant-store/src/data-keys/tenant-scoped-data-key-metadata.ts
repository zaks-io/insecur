import type {
  TenantDataKeyMetadataProvisioner,
  TenantDataKeyMetadataReader,
} from "@insecur/crypto";
import type { OrganizationId, ProjectId } from "@insecur/domain";

import { TenantDataKeyMetadataStore } from "./tenant-data-key-metadata-store.js";
import type { SeedOrganizationDataKeyInput, SeedProjectDataKeyInput } from "./types.js";
import { withTenantScope } from "../with-tenant-scope.js";

function generateDataKeyRowId(prefix: "odk" | "pdk"): string {
  const body = crypto.randomUUID().replace(/-/g, "").slice(0, 26).toUpperCase();
  return `${prefix}_${body}`;
}

async function withOrganizationMetadataStore<TResult>(
  organizationId: OrganizationId,
  run: (store: TenantDataKeyMetadataStore) => Promise<TResult>,
): Promise<TResult> {
  return withTenantScope({ kind: "organization", organizationId }, async ({ db }) =>
    run(new TenantDataKeyMetadataStore(db)),
  );
}

/** Tenant-scoped metadata reads and wrapped-ref persistence for production keyrings. */
export class TenantScopedDataKeyMetadataAccess
  implements TenantDataKeyMetadataReader, TenantDataKeyMetadataProvisioner
{
  getActiveOrganizationDataKey(organizationId: OrganizationId) {
    return withOrganizationMetadataStore(organizationId, (store) =>
      store.getActiveOrganizationDataKey(organizationId),
    );
  }

  getOrganizationDataKeyVersion(organizationId: OrganizationId, keyVersion: number) {
    return withOrganizationMetadataStore(organizationId, (store) =>
      store.getOrganizationDataKeyVersion(organizationId, keyVersion),
    );
  }

  getActiveProjectDataKey(organizationId: OrganizationId, projectId: ProjectId) {
    return withOrganizationMetadataStore(organizationId, (store) =>
      store.getActiveProjectDataKey(organizationId, projectId),
    );
  }

  getProjectDataKeyVersion(
    organizationId: OrganizationId,
    projectId: ProjectId,
    keyVersion: number,
  ) {
    return withOrganizationMetadataStore(organizationId, (store) =>
      store.getProjectDataKeyVersion(organizationId, projectId, keyVersion),
    );
  }

  getOrganizationDataKeyForReadiness(organizationId: OrganizationId) {
    return withOrganizationMetadataStore(organizationId, (store) =>
      store.getOrganizationDataKeyForReadiness(organizationId),
    );
  }

  getProjectDataKeyForReadiness(organizationId: OrganizationId, projectId: ProjectId) {
    return withOrganizationMetadataStore(organizationId, (store) =>
      store.getProjectDataKeyForReadiness(organizationId, projectId),
    );
  }

  async persistOrganizationDataKey(input: {
    readonly organizationId: OrganizationId;
    readonly keyVersion: number;
    readonly rootKeyVersion: number;
    readonly wrappedStorageRef: string;
    readonly rowId?: string;
  }): Promise<void> {
    await withOrganizationMetadataStore(input.organizationId, async (store) => {
      const existing = await store.getOrganizationDataKeyVersion(
        input.organizationId,
        input.keyVersion,
      );
      if (existing) {
        await store.updateOrganizationDataKeyWrap(input.organizationId, input.keyVersion, {
          wrappedStorageRef: input.wrappedStorageRef,
          rootKeyVersion: input.rootKeyVersion,
          status: existing.status,
        });
        return;
      }
      const seed: SeedOrganizationDataKeyInput = {
        id: input.rowId ?? generateDataKeyRowId("odk"),
        organizationId: input.organizationId,
        keyVersion: input.keyVersion,
        status: "active",
        rootKeyVersion: input.rootKeyVersion,
        wrappedStorageRef: input.wrappedStorageRef,
      };
      await store.insertOrganizationDataKey(seed);
    });
  }

  async persistProjectDataKey(input: {
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly keyVersion: number;
    readonly organizationDataKeyVersion: number;
    readonly wrappedStorageRef: string;
    readonly rowId?: string;
  }): Promise<void> {
    await withOrganizationMetadataStore(input.organizationId, async (store) => {
      const existing = await store.getProjectDataKeyVersion(
        input.organizationId,
        input.projectId,
        input.keyVersion,
      );
      if (existing) {
        await store.updateProjectDataKeyWrap(
          input.organizationId,
          input.projectId,
          input.keyVersion,
          {
            wrappedStorageRef: input.wrappedStorageRef,
            status: existing.status,
          },
        );
        return;
      }
      const seed: SeedProjectDataKeyInput = {
        id: input.rowId ?? generateDataKeyRowId("pdk"),
        organizationId: input.organizationId,
        projectId: input.projectId,
        keyVersion: input.keyVersion,
        organizationDataKeyVersion: input.organizationDataKeyVersion,
        status: "active",
        wrappedStorageRef: input.wrappedStorageRef,
      };
      await store.insertProjectDataKey(seed);
    });
  }
}

export function createTenantDataKeyMetadataAccess(): TenantScopedDataKeyMetadataAccess {
  return new TenantScopedDataKeyMetadataAccess();
}
