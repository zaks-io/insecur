import type { Keyring } from "@insecur/crypto";
import {
  APP_CONNECTION_ERROR_CODES,
  type AppConnectionId,
  type OrganizationId,
} from "@insecur/domain";
import {
  type AppConnectionRow,
  TenantAppConnectionStore,
  TenantSensitiveMetadataStore,
  withTenantScope,
} from "@insecur/tenant-store";

import { AppConnectionError } from "./app-connection-error.js";

export interface OrgAppConnectionStores {
  readonly appConnectionStore: TenantAppConnectionStore;
  readonly sensitiveMetadataStore: TenantSensitiveMetadataStore;
}

async function withOrgAppConnection<T>(
  input: {
    readonly organizationId: OrganizationId;
    readonly appConnectionId: AppConnectionId;
  },
  run: (stores: OrgAppConnectionStores, connection: AppConnectionRow) => Promise<T>,
): Promise<T> {
  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const appConnectionStore = new TenantAppConnectionStore(db);
      const sensitiveMetadataStore = new TenantSensitiveMetadataStore(db);
      const connection = await appConnectionStore.getConnectionById(
        input.organizationId,
        input.appConnectionId,
      );
      if (!connection) {
        throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.notFound);
      }
      return run({ appConnectionStore, sensitiveMetadataStore }, connection);
    },
  );
}

export async function withOrgAppConnectionKeyring<T>(
  input: {
    readonly organizationId: OrganizationId;
    readonly appConnectionId: AppConnectionId;
    readonly keyring: Keyring;
  },
  run: (
    stores: OrgAppConnectionStores & { readonly keyring: Keyring },
    connection: AppConnectionRow,
  ) => Promise<T>,
): Promise<T> {
  return withOrgAppConnection(input, (stores, connection) =>
    run({ ...stores, keyring: input.keyring }, connection),
  );
}
