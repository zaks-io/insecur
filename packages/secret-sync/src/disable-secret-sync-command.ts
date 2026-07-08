import type { UserActorRef } from "@insecur/access";
import type {
  EnvironmentId,
  OrganizationId,
  ProjectId,
  RequestId,
  SecretSyncId,
} from "@insecur/domain";

import { disableSecretSyncInStore } from "./disable-secret-sync-in-store.js";
import type { MetadataSafeSecretSync } from "./metadata-safe-secret-sync.js";
import {
  recordSecretSyncDisableDenied,
  recordSecretSyncDisabled,
  toSecretSyncAuditReasonCode,
} from "./record-secret-sync-audit.js";
import {
  buildSecretSyncCommandAuditScope,
  runScopedSecretSyncMutation,
} from "./secret-sync-command-shared.js";

export interface DisableSecretSyncCommandInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretSyncId: SecretSyncId;
  readonly requestId: RequestId;
}

export interface DisableSecretSyncCommandResult {
  readonly secretSync: MetadataSafeSecretSync;
  readonly auditEventId: string;
}

export async function disableSecretSyncCommand(
  input: DisableSecretSyncCommandInput,
): Promise<DisableSecretSyncCommandResult> {
  const auditScope = buildSecretSyncCommandAuditScope({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    requestId: input.requestId,
  });

  try {
    const disabled = await runScopedSecretSyncMutation({
      actor: input.actor,
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      secretSyncId: input.secretSyncId,
      run: async ({ db, existing }) =>
        disableSecretSyncInStore({
          db,
          organizationId: input.organizationId,
          existing,
        }),
    });

    const audit = await recordSecretSyncDisabled({
      ...auditScope,
      secretSyncId: disabled.sync.id,
    });

    return {
      secretSync: disabled.secretSync,
      auditEventId: audit.auditEventId,
    };
  } catch (error) {
    await recordSecretSyncDisableDenied({
      ...auditScope,
      reasonCode: toSecretSyncAuditReasonCode(error),
      secretSyncId: input.secretSyncId,
    });
    throw error;
  }
}
