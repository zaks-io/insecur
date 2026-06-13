import type {
  TenantDataKeyMetadataProvisioner,
  TenantDataKeyMetadataReader,
} from "@insecur/crypto";
import type { OrganizationId, ProjectId } from "@insecur/domain";

import { TenantDataKeyMetadataStore } from "./tenant-data-key-metadata-store.js";
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
  }): Promise<string> {
    return withOrganizationMetadataStore(input.organizationId, (store) =>
      store.persistOrganizationDataKeyAuthoritative({
        organizationId: input.organizationId,
        keyVersion: input.keyVersion,
        rootKeyVersion: input.rootKeyVersion,
        wrappedStorageRef: input.wrappedStorageRef,
        rowId: input.rowId ?? generateDataKeyRowId("odk"),
      }),
    );
  }

  async persistProjectDataKey(input: {
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly keyVersion: number;
    readonly organizationDataKeyVersion: number;
    readonly wrappedStorageRef: string;
    readonly rowId?: string;
  }): Promise<string> {
    return withOrganizationMetadataStore(input.organizationId, (store) =>
      store.persistProjectDataKeyAuthoritative({
        organizationId: input.organizationId,
        projectId: input.projectId,
        keyVersion: input.keyVersion,
        organizationDataKeyVersion: input.organizationDataKeyVersion,
        wrappedStorageRef: input.wrappedStorageRef,
        rowId: input.rowId ?? generateDataKeyRowId("pdk"),
      }),
    );
  }
}

export function createTenantDataKeyMetadataAccess(): TenantScopedDataKeyMetadataAccess {
  return new TenantScopedDataKeyMetadataAccess();
}
