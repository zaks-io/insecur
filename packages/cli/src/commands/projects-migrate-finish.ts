import { successEnvelope, type VariableKey } from "@insecur/domain";
import type { LocalStore } from "@insecur/local-store";
import type { GlobalCliFlags } from "../cli-options.js";
import { isLocalModeHost } from "../config/local-mode.js";
import { writeProjectConfig, type InsecurProjectConfig } from "../config/project-config.js";
import { upsertUserProfile } from "../config/user-config.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import type { LocalMigrateSnapshot } from "../local/migrate-local-snapshot.js";
import { renderSuccess } from "../output/render.js";
import { asEchoId, buildEnvelopeMeta } from "../output/target-echo.js";
import type { MigratePreview } from "./projects-migrate-confirm.js";
import type { MigrateCloudTarget, MigrateReconcileResult } from "./projects-migrate-reconcile.js";

const MIGRATED_AUDIT_EVENT = "local.project_migrated";

/**
 * Verified-then-clean (ADR-0080): every key is already accounted for remotely when this runs.
 * Local rows and wrapped material go first (schema cascades, audit rows survive with a nulled
 * project reference), then the profile, and the committed `.insecur.json` flips to the cloud
 * host strictly last. Every interruption point leaves the config on `"local"`, and a re-run
 * converges: adopt re-creates metadata from the committed manifest, every key classifies as
 * remote-present, and the finish sequence runs again.
 */
export async function cleanLocalAndFlipConfig(input: {
  readonly flags: GlobalCliFlags;
  readonly context: ResolvedCliContext;
  readonly config: InsecurProjectConfig;
  readonly store: LocalStore;
  readonly target: MigrateCloudTarget;
  readonly outcome: MigrateReconcileResult;
  readonly snapshot: LocalMigrateSnapshot;
}): Promise<string> {
  await input.store.audit.writeEvent({
    eventCode: MIGRATED_AUDIT_EVENT,
    outcome: "success",
    projectId: input.snapshot.projectId,
    environmentId: input.snapshot.environmentId,
    details: {
      organizationId: input.target.organizationId,
      host: input.target.host,
      createdKeyCount: input.outcome.createdKeys.length,
      matchedKeyCount: input.outcome.matchedKeys.length,
      skippedKeyCount: input.outcome.skippedKeys.length,
    },
  });
  await input.store.projects.deleteProject(input.snapshot.projectId);
  const profile = input.context.userConfig.profiles[input.config.profileId];
  if (
    profile !== undefined &&
    isLocalModeHost(profile.host) &&
    profile.projectId === input.config.projectId
  ) {
    await upsertUserProfile(input.config.profileId, {
      ...profile,
      host: input.target.host,
      orgId: input.target.organizationId,
    });
  }
  return writeProjectConfig(input.flags.configDir, {
    host: input.target.host,
    orgId: input.target.organizationId,
    projectId: input.config.projectId,
    defaultEnvId: input.config.defaultEnvId,
    profileId: input.config.profileId,
    ...(input.config.gitBranchToEnvironment === undefined
      ? {}
      : { gitBranchToEnvironment: input.config.gitBranchToEnvironment }),
  });
}

function keyDisposition(outcome: MigrateReconcileResult, variableKey: VariableKey): string {
  if (outcome.createdKeys.includes(variableKey)) {
    return "migrated";
  }
  if (outcome.matchedKeys.includes(variableKey)) {
    return "already_in_sync";
  }
  if (outcome.skippedKeys.includes(variableKey)) {
    return "skipped_remote_value_kept";
  }
  return "remote_only";
}

export function renderMigrated(input: {
  readonly flags: GlobalCliFlags;
  readonly preview: MigratePreview;
  readonly outcome: MigrateReconcileResult;
  readonly configPath: string;
}): void {
  const removedKeys = input.preview.variableKeys.map((variableKey) => ({
    variableKey,
    disposition: keyDisposition(input.outcome, variableKey),
  }));
  const output = successEnvelope(
    {
      status: "migrated",
      host: input.preview.host,
      organizationId: input.preview.organizationId,
      projectId: input.preview.projectId,
      environmentId: input.preview.environmentId,
      createdProject: input.outcome.createdProject,
      createdEnvironment: input.outcome.createdEnvironment,
      createdKeys: input.outcome.createdKeys,
      matchedKeys: input.outcome.matchedKeys,
      skippedKeys: input.outcome.skippedKeys,
      removedLocal: {
        valueCount: input.preview.localValueCount,
        keys: removedKeys,
      },
      configPath: input.configPath,
    },
    buildEnvelopeMeta({
      resolvedTargets: [
        {
          type: "project",
          id: asEchoId(input.preview.projectId),
          parent: { type: "organization", id: asEchoId(input.preview.organizationId) },
        },
      ],
    }),
  );
  renderSuccess(output, input.flags, (data) => {
    const manifest = data.removedLocal.keys
      .map((key) => `  - ${key.variableKey}: ${key.disposition}`)
      .join("\n");
    return (
      `Migrated project ${data.projectId} to ${data.host}. ` +
      `Verified ${String(data.removedLocal.keys.length)} key(s) present remotely, ` +
      `removed ${String(data.removedLocal.valueCount)} local value(s), and pointed ${data.configPath} at the cloud host.\n` +
      `Removal manifest:\n${manifest}`
    );
  });
}

export function renderAlreadyHosted(flags: GlobalCliFlags, config: InsecurProjectConfig): number {
  const output = successEnvelope(
    {
      status: "already_in_sync",
      host: config.host,
      projectId: config.projectId,
      environmentId: config.defaultEnvId,
    },
    buildEnvelopeMeta({}),
  );
  renderSuccess(
    output,
    flags,
    () => `Project ${config.projectId} already targets ${config.host}; already in sync.`,
  );
  return 0;
}
