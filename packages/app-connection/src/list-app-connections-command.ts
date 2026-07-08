import type { UserActorRef } from "@insecur/access";
import type { OrganizationId } from "@insecur/domain";
import { TenantAppConnectionStore, withTenantScope } from "@insecur/tenant-store";

import { assertConnectionReadScope } from "./assert-connection-access.js";
import { toMetadataSafeAppConnectionStatus } from "./metadata-safe-connection-status.js";

export async function listAppConnectionsCommand(input: {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
}): Promise<ReturnType<typeof toMetadataSafeAppConnectionStatus>[]> {
  await assertConnectionReadScope(input.actor, input.organizationId);

  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const store = new TenantAppConnectionStore(db);
      const connections = await store.listConnections({ organizationId: input.organizationId });
      return connections.map((connection) => toMetadataSafeAppConnectionStatus(connection));
    },
  );
}
