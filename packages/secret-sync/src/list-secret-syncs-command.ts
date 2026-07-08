import type { UserActorRef } from "@insecur/access";
import type { OrganizationId, ProjectId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";

import { resolveSecretSyncProjectReadAccess } from "./assert-secret-sync-access.js";
import { listMetadataSafeSecretSyncs } from "./list-metadata-safe-secret-syncs.js";
import type { MetadataSafeSecretSync } from "./metadata-safe-secret-sync.js";

export interface ListSecretSyncsCommandInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
}

export interface ListSecretSyncsCommandResult {
  readonly secretSyncs: readonly MetadataSafeSecretSync[];
}

export async function listSecretSyncsCommand(
  input: ListSecretSyncsCommandInput,
): Promise<ListSecretSyncsCommandResult> {
  await resolveSecretSyncProjectReadAccess(input.actor, {
    organizationId: input.organizationId,
    projectId: input.projectId,
  });

  const secretSyncs = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) =>
      listMetadataSafeSecretSyncs({
        db,
        organizationId: input.organizationId,
        projectId: input.projectId,
      }),
  );

  return { secretSyncs };
}
