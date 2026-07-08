import type { Keyring } from "@insecur/crypto";
import type { UserActorRef } from "@insecur/access";
import {
  type DisplayName,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
  type SecretSyncId,
} from "@insecur/domain";
import type { SecretSyncMappingBehavior } from "@insecur/domain";

import type { MetadataSafeSecretSync } from "./metadata-safe-secret-sync.js";
import {
  persistSecretSyncUpdate,
  type PersistSecretSyncUpdateInput,
} from "./persist-secret-sync-update.js";
import {
  recordSecretSyncUpdateDenied,
  recordSecretSyncUpdated,
  toSecretSyncAuditReasonCode,
} from "./record-secret-sync-audit.js";
import {
  buildSecretSyncCommandAuditScope,
  runScopedSecretSyncMutation,
} from "./secret-sync-command-shared.js";
import type { SecretSyncBindingInput } from "./validate-secret-sync-bindings.js";
import type { GitHubActionsTargetInput } from "./validate-secret-sync-target.js";

export interface UpdateSecretSyncCommandInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretSyncId: SecretSyncId;
  readonly displayName?: DisplayName;
  readonly mappingBehavior?: SecretSyncMappingBehavior;
  readonly autoSyncEnabled?: boolean;
  readonly bindings?: readonly SecretSyncBindingInput[];
  readonly githubTarget?: GitHubActionsTargetInput;
  readonly cloudflareTarget?: { readonly workerScriptName: string };
  readonly requestId: RequestId;
  readonly keyring: Keyring;
}

export interface UpdateSecretSyncCommandResult {
  readonly secretSync: MetadataSafeSecretSync;
  readonly auditEventId: string;
}

import type { SecretSyncRow, TenantScopedDb } from "@insecur/tenant-store";

function buildPersistSecretSyncUpdateInput(
  input: UpdateSecretSyncCommandInput,
  db: TenantScopedDb,
  existing: SecretSyncRow,
): PersistSecretSyncUpdateInput {
  return {
    db,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    existing,
    keyring: input.keyring,
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    ...(input.mappingBehavior !== undefined ? { mappingBehavior: input.mappingBehavior } : {}),
    ...(input.autoSyncEnabled !== undefined ? { autoSyncEnabled: input.autoSyncEnabled } : {}),
    ...(input.bindings !== undefined ? { bindings: input.bindings } : {}),
    ...(input.githubTarget !== undefined ? { githubTarget: input.githubTarget } : {}),
    ...(input.cloudflareTarget !== undefined ? { cloudflareTarget: input.cloudflareTarget } : {}),
  };
}

async function executeSecretSyncUpdate(
  input: UpdateSecretSyncCommandInput,
  db: TenantScopedDb,
  existing: SecretSyncRow,
) {
  return persistSecretSyncUpdate(buildPersistSecretSyncUpdateInput(input, db, existing));
}

export async function updateSecretSyncCommand(
  input: UpdateSecretSyncCommandInput,
): Promise<UpdateSecretSyncCommandResult> {
  const auditScope = buildSecretSyncCommandAuditScope({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    requestId: input.requestId,
  });

  try {
    const updated = await runScopedSecretSyncMutation({
      actor: input.actor,
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      secretSyncId: input.secretSyncId,
      run: async ({ db, existing }) => executeSecretSyncUpdate(input, db, existing),
    });

    const audit = await recordSecretSyncUpdated({
      ...auditScope,
      secretSyncId: updated.sync.id,
      ...(updated.bindingAuditDetails !== undefined
        ? { bindings: updated.bindingAuditDetails }
        : {}),
    });
    return { secretSync: updated.secretSync, auditEventId: audit.auditEventId };
  } catch (error) {
    await recordSecretSyncUpdateDenied({
      ...auditScope,
      reasonCode: toSecretSyncAuditReasonCode(error),
      secretSyncId: input.secretSyncId,
    });
    throw error;
  }
}
