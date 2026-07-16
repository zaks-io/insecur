import type { Keyring } from "@insecur/crypto";
import type { UserActorRef } from "@insecur/access";
import {
  SECRET_SYNC_ERROR_CODES,
  SECRET_SYNC_KINDS,
  secretSyncId,
  type AppConnectionId,
  type DisplayName,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
  type SecretSyncId,
} from "@insecur/domain";
import type { SecretSyncKind, SecretSyncMappingBehavior } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";

import { assertSecretSyncBindings } from "./assert-secret-sync-bindings.js";
import { assertProtectedSecretSyncActionApproved } from "./assert-secret-sync-delivery-approval.js";
import { resolveSecretSyncManageAccess } from "./assert-secret-sync-access.js";
import { persistNewSecretSync } from "./persist-new-secret-sync.js";
import type { MetadataSafeSecretSync } from "./metadata-safe-secret-sync.js";
import {
  recordSecretSyncCreateDenied,
  recordSecretSyncCreated,
  toBindingAuditDetails,
  toSecretSyncAuditReasonCode,
} from "./record-secret-sync-audit.js";
import { SecretSyncError } from "./secret-sync-error.js";
import { buildSecretSyncCommandAuditScope } from "./secret-sync-command-shared.js";
import {
  validateCloudflareWorkerSecretTarget,
  validateGitHubActionsTarget,
  validateSecretSyncKind,
  type GitHubActionsTargetInput,
} from "./validate-secret-sync-target.js";
import {
  validateSecretSyncBindings,
  type SecretSyncBindingInput,
} from "./validate-secret-sync-bindings.js";

export interface CreateSecretSyncCommandInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly appConnectionId: AppConnectionId;
  readonly displayName: DisplayName;
  readonly kind: string;
  readonly mappingBehavior?: SecretSyncMappingBehavior;
  readonly autoSyncEnabled?: boolean;
  readonly bindings: readonly SecretSyncBindingInput[];
  readonly githubTarget?: GitHubActionsTargetInput;
  readonly cloudflareTarget?: { readonly workerScriptName: string };
  readonly requestId: RequestId;
  readonly keyring: Keyring;
  readonly secretSyncId?: SecretSyncId;
  /** Approved Protected Change authorizing this enable when the environment is protected (INS-87). */
  readonly protectedChangeId?: RequestId;
}

export interface CreateSecretSyncCommandResult {
  readonly secretSync: MetadataSafeSecretSync;
  readonly auditEventId: string;
}

function validateTargetForKind(
  kind: SecretSyncKind,
  input: CreateSecretSyncCommandInput,
): ReturnType<typeof validateGitHubActionsTarget> {
  if (kind === SECRET_SYNC_KINDS.githubActions) {
    if (input.githubTarget === undefined) {
      throw new SecretSyncError(
        SECRET_SYNC_ERROR_CODES.invalidDestination,
        "github-actions secret sync requires target configuration",
      );
    }
    return validateGitHubActionsTarget(input.githubTarget);
  }
  if (input.cloudflareTarget === undefined) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidDestination,
      "cloudflare worker secret sync requires target configuration",
    );
  }
  return validateCloudflareWorkerSecretTarget(input.cloudflareTarget);
}

async function validateCreateSecretSyncInput(input: CreateSecretSyncCommandInput) {
  await resolveSecretSyncManageAccess(input.actor, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  });

  const kind = validateSecretSyncKind(input.kind);
  const validatedBindings = validateSecretSyncBindings(input.bindings);
  const validatedTarget = validateTargetForKind(kind, input);

  await assertSecretSyncBindings({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    secretIds: validatedBindings.map((binding) => binding.secretId),
  });

  return { kind, validatedBindings, validatedTarget };
}

async function executeCreateSecretSync(
  input: CreateSecretSyncCommandInput,
  secretSyncIdValue: SecretSyncId,
) {
  const validated = await validateCreateSecretSyncInput(input);

  // Creating a sync makes it active, so a protected-environment create is a protected enable and
  // needs current approval evidence for this exact sync id before anything persists (INS-87).
  await assertProtectedSecretSyncActionApproved("secret_sync_enable", input, secretSyncIdValue);

  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) =>
      persistNewSecretSync({
        db,
        actor: input.actor,
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        appConnectionId: input.appConnectionId,
        secretSyncId: secretSyncIdValue,
        displayName: input.displayName,
        kind: validated.kind,
        ...(input.mappingBehavior !== undefined ? { mappingBehavior: input.mappingBehavior } : {}),
        ...(input.autoSyncEnabled !== undefined ? { autoSyncEnabled: input.autoSyncEnabled } : {}),
        validatedBindings: validated.validatedBindings,
        validatedTarget: validated.validatedTarget,
        keyring: input.keyring,
      }),
  );
}

export async function createSecretSyncCommand(
  input: CreateSecretSyncCommandInput,
): Promise<CreateSecretSyncCommandResult> {
  const auditScope = buildSecretSyncCommandAuditScope({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    requestId: input.requestId,
  });
  const secretSyncIdValue = input.secretSyncId ?? secretSyncId.generate();

  try {
    const created = await executeCreateSecretSync(input, secretSyncIdValue);
    const audit = await recordSecretSyncCreated({
      ...auditScope,
      secretSyncId: created.sync.id,
      bindings: toBindingAuditDetails({ bindings: created.persistedBindings }),
    });
    return { secretSync: created.secretSync, auditEventId: audit.auditEventId };
  } catch (error) {
    await recordSecretSyncCreateDenied({
      ...auditScope,
      reasonCode: toSecretSyncAuditReasonCode(error),
      secretSyncId: secretSyncIdValue,
    });
    throw error;
  }
}
