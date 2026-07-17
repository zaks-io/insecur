import {
  SECRET_SYNC_ERROR_CODES,
  SECRET_SYNC_KINDS,
  type AppConnectionId,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type SecretId,
  type SecretSyncBindingId,
  type SecretSyncId,
  type SecretSyncKind,
} from "@insecur/domain";
import type { ProtectedDeliveryTargetKind } from "@insecur/protected-change";
import {
  withTenantScope,
  type AppConnectionRow,
  type SecretSyncBindingRow,
  type SecretSyncRow,
  type TenantScopedDb,
} from "@insecur/tenant-store";

import { assertSecretSyncBindings } from "./assert-secret-sync-bindings.js";
import { loadExecutableSecretSyncContext } from "./load-executable-secret-sync-context.js";
import {
  hasProviderOverwriteWarning,
  lookupExactDestinationSafely,
  resolveProviderLookupPort,
  toProviderPermissionStatus,
  toProviderTargetExistence,
  type ProviderLookupStatus,
  type ProviderPermissionStatus,
  type ProviderTargetExistence,
  type SecretSyncProviderLookupPorts,
} from "./provider-lookup-port.js";
import { SecretSyncError } from "./secret-sync-error.js";

/** Metadata-only plan row for one exact Secret Sync Binding destination. */
export interface SecretSyncPlanBinding {
  readonly bindingId: SecretSyncBindingId;
  readonly secretId: SecretId;
  readonly lookupStatus: ProviderLookupStatus;
  readonly targetExistence: ProviderTargetExistence;
  readonly permissionStatus: ProviderPermissionStatus;
  readonly overwriteWarning: boolean;
}

export type SecretSyncPlanWarningCode = typeof SECRET_SYNC_ERROR_CODES.overwriteStatusUnknown;

const CLOUDFLARE_WORKER_DEPLOY_IMPACT =
  "cloudflare_worker_secret_deploy" satisfies ProtectedDeliveryTargetKind;

export type SecretSyncDeployImpact = typeof CLOUDFLARE_WORKER_DEPLOY_IMPACT;

/**
 * Metadata-only provider deploy-impact label. A Cloudflare Worker secret
 * write is a production deploy (ADR-0039), so plan, approval, and audit
 * output name that impact with the protected-delivery vocabulary token —
 * never the Worker script name, which is Sensitive Metadata.
 */
export function syncDeployImpact(kind: SecretSyncKind): SecretSyncDeployImpact | null {
  return kind === SECRET_SYNC_KINDS.cloudflareWorkerSecret ? CLOUDFLARE_WORKER_DEPLOY_IMPACT : null;
}

/**
 * Metadata-only Secret Sync plan. Contains opaque IDs, normalized statuses,
 * and warnings; never Sensitive Values, provider destination names, or raw
 * provider responses. The fingerprint pins the exact configuration and lookup
 * statuses the plan was computed from, for Sync Execution Revalidation.
 */
export interface SecretSyncPlan {
  readonly secretSyncId: SecretSyncId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly appConnectionId: AppConnectionId;
  readonly kind: SecretSyncKind;
  readonly connectionStatus: AppConnectionRow["status"];
  readonly plannedAt: string;
  readonly bindings: readonly SecretSyncPlanBinding[];
  readonly overwriteWarningCount: number;
  readonly warningCodes: readonly SecretSyncPlanWarningCode[];
  /** Non-null when every write in this plan is provider-side production deploy impact (ADR-0039). */
  readonly deployImpact: SecretSyncDeployImpact | null;
  readonly fingerprint: string;
}

const FINGERPRINT_VERSION = 1;

async function sha256Hex(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function computePlanFingerprint(input: {
  readonly sync: {
    readonly id: SecretSyncId;
    readonly updatedAt: Date;
    readonly kind: SecretSyncKind;
    readonly appConnectionId: AppConnectionId;
  };
  readonly connection: { readonly status: AppConnectionRow["status"]; readonly updatedAt: Date };
  readonly bindings: readonly SecretSyncPlanBinding[];
}): Promise<string> {
  const canonical = JSON.stringify({
    version: FINGERPRINT_VERSION,
    secretSyncId: input.sync.id,
    syncUpdatedAt: input.sync.updatedAt.toISOString(),
    kind: input.sync.kind,
    appConnectionId: input.sync.appConnectionId,
    connectionStatus: input.connection.status,
    connectionUpdatedAt: input.connection.updatedAt.toISOString(),
    bindings: [...input.bindings]
      .sort((left, right) => left.bindingId.localeCompare(right.bindingId))
      .map((binding) => ({
        bindingId: binding.bindingId,
        secretId: binding.secretId,
        lookupStatus: binding.lookupStatus,
      })),
  });
  return sha256Hex(canonical);
}

async function lookupPlanBindings(input: {
  readonly sync: SecretSyncRow;
  readonly bindings: readonly SecretSyncBindingRow[];
  readonly lookupPorts: SecretSyncProviderLookupPorts;
}): Promise<readonly SecretSyncPlanBinding[]> {
  const port = resolveProviderLookupPort(input.lookupPorts, input.sync.kind);
  const planBindings: SecretSyncPlanBinding[] = [];
  for (const binding of input.bindings) {
    const lookup = await lookupExactDestinationSafely(port, {
      providerKind: input.sync.kind,
      organizationId: input.sync.organizationId,
      appConnectionId: input.sync.appConnectionId,
      secretSyncId: input.sync.id,
      bindingId: binding.id,
      githubProviderScope: input.sync.githubProviderScope,
      targetRepoId: input.sync.targetRepoId,
      targetGithubEnvironmentId: input.sync.targetGithubEnvironmentId,
      hasWorkerScriptTarget: input.sync.kind === SECRET_SYNC_KINDS.cloudflareWorkerSecret,
    });
    planBindings.push({
      bindingId: binding.id,
      secretId: binding.secretId,
      lookupStatus: lookup.status,
      targetExistence: toProviderTargetExistence(lookup.status),
      permissionStatus: toProviderPermissionStatus(lookup.status),
      overwriteWarning: hasProviderOverwriteWarning(lookup.status),
    });
  }
  return planBindings;
}

export type ComputeSecretSyncPlanInTenantScopeInput = Omit<ComputeSecretSyncPlanInput, "db">;

/** Runs `computeSecretSyncPlan` inside a fresh organization-scoped tenant scope. */
export async function computeSecretSyncPlanInTenantScope(
  input: ComputeSecretSyncPlanInTenantScopeInput,
): Promise<SecretSyncPlan> {
  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => computeSecretSyncPlan({ ...input, db }),
  );
}

export interface ComputeSecretSyncPlanInput {
  readonly db: TenantScopedDb;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretSyncId: SecretSyncId;
  readonly lookupPorts: SecretSyncProviderLookupPorts;
}

/**
 * Computes a metadata-only Secret Sync plan by running Explicit Provider
 * Lookup for each exact configured binding destination. Lookups check only
 * destinations named by Secret Sync Bindings inside the sync's App Connection
 * boundary; there is no inventory or pattern expansion.
 */
export async function computeSecretSyncPlan(
  input: ComputeSecretSyncPlanInput,
): Promise<SecretSyncPlan> {
  const context = await loadExecutableSecretSyncContext({
    db: input.db,
    organizationId: input.organizationId,
    secretSyncId: input.secretSyncId,
  });

  if (
    context.sync.projectId !== input.projectId ||
    context.sync.environmentId !== input.environmentId
  ) {
    throw new SecretSyncError(SECRET_SYNC_ERROR_CODES.notFound, "secret sync not found");
  }

  await assertSecretSyncBindings({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    secretIds: context.bindings.map((binding) => binding.secretId),
  });

  const planBindings = await lookupPlanBindings({
    sync: context.sync,
    bindings: context.bindings,
    lookupPorts: input.lookupPorts,
  });

  const fingerprint = await computePlanFingerprint({
    sync: context.sync,
    connection: context.connection,
    bindings: planBindings,
  });

  const hasUnknownOverwriteStatus = planBindings.some(
    (binding) => binding.targetExistence === "provider_target.unknown",
  );

  return {
    secretSyncId: context.sync.id,
    organizationId: context.sync.organizationId,
    projectId: context.sync.projectId,
    environmentId: context.sync.environmentId,
    appConnectionId: context.sync.appConnectionId,
    kind: context.sync.kind,
    connectionStatus: context.connection.status,
    plannedAt: new Date().toISOString(),
    bindings: planBindings,
    overwriteWarningCount: planBindings.filter((binding) => binding.overwriteWarning).length,
    warningCodes: hasUnknownOverwriteStatus ? [SECRET_SYNC_ERROR_CODES.overwriteStatusUnknown] : [],
    deployImpact: syncDeployImpact(context.sync.kind),
    fingerprint,
  };
}
