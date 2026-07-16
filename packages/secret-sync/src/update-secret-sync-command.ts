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

import { resolveSecretSyncManageAccess } from "./assert-secret-sync-access.js";
import { assertProtectedSecretSyncActionApproved } from "./assert-secret-sync-delivery-approval.js";
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
  /** Approved Protected Change authorizing this configuration change when the environment is protected (INS-87). */
  readonly protectedChangeId?: RequestId;
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
    // Authorization runs before the protected-delivery gate, matching create and revalidate, so a
    // no-access in-tenant actor gets the access denial instead of probing whether the environment
    // is protected or generating denied protected-delivery audit rows (INS-611). The scoped
    // mutation below resolves the same manage access again as defense in depth.
    await resolveSecretSyncManageAccess(input.actor, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
    });

    // Reconfiguring a protected-environment sync is a protected delivery configuration change and
    // needs current approval evidence before the mutation runs (INS-87). The scoped mutation below
    // only proceeds when the sync really lives at this exact coordinate, so gating on the requested
    // coordinate cannot be bypassed by naming a non-protected environment.
    await assertProtectedSecretSyncActionApproved("secret_sync_enable", input, input.secretSyncId);

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
