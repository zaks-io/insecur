import { type AppConnectionId, type OrganizationId, type ProjectId } from "@insecur/domain";
import type { Keyring } from "@insecur/crypto";
import type {
  AppConnectionRow,
  TenantAppConnectionStore,
  TenantSensitiveMetadataStore,
} from "@insecur/tenant-store";
import type { UserActorRef } from "@insecur/access";

import { disableAppConnection } from "./disable-app-connection.js";
import { withCloudflareConnectionManageAccess } from "./with-cloudflare-connection-access.js";

export interface DisableCloudflareConnectionInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly appConnectionId: AppConnectionId;
  readonly keyring: Keyring;
  readonly appConnectionStore: TenantAppConnectionStore;
  readonly sensitiveMetadataStore: TenantSensitiveMetadataStore;
}

export async function disableCloudflareConnection(
  input: DisableCloudflareConnectionInput,
): Promise<AppConnectionRow> {
  return disableAppConnection(
    { ...input, clearActiveCredential: true },
    withCloudflareConnectionManageAccess,
  );
}
