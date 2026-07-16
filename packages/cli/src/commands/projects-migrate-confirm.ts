import {
  CLI_ERROR_CODES,
  parseVariableKey,
  VALIDATION_ERROR_CODES,
  type OrganizationId,
  type VariableKey,
} from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import type { LocalMigrateSnapshot } from "../local/migrate-local-snapshot.js";
import { CliError } from "../output/cli-error.js";
import { actionableRemediation } from "../output/cli-remediation.js";

export interface ProjectsMigrateCommandOptions {
  readonly orgId: string | undefined;
  readonly confirmMigrate: boolean;
  readonly yes: boolean;
  readonly skipKeys: readonly string[];
}

export interface MigratePreview {
  readonly host: string;
  readonly organizationId: OrganizationId;
  readonly projectId: string;
  readonly environmentId: string;
  readonly variableKeys: readonly VariableKey[];
  readonly keyCount: number;
  readonly localValueCount: number;
}

/** Metadata-only preview shown before the confirmation: keys, counts, and target echo only. */
export function buildPreview(
  snapshot: LocalMigrateSnapshot,
  host: string,
  organizationId: OrganizationId,
): MigratePreview {
  return {
    host,
    organizationId,
    projectId: snapshot.projectId,
    environmentId: snapshot.environmentId,
    variableKeys: snapshot.keys.map((key) => key.variableKey),
    keyCount: snapshot.keys.length,
    localValueCount: snapshot.keys.filter((key) => key.hasLocalValue).length,
  };
}

function previewLines(preview: MigratePreview): string {
  return [
    `Migrate local project ${preview.projectId} to ${preview.host} (organization ${preview.organizationId}).`,
    `Variable keys (${String(preview.keyCount)}, ${String(preview.localValueCount)} with values on this machine): ${preview.variableKeys.join(", ")}`,
    "After every value is verified present remotely, local copies are deleted and .insecur.json flips to the cloud host. This is one-way.",
  ].join("\n");
}

export function parseSkipKeys(
  rawKeys: readonly string[],
  snapshot: LocalMigrateSnapshot,
): ReadonlySet<VariableKey> {
  const known = new Set<string>(snapshot.keys.map((key) => key.variableKey));
  const skipKeys = new Set<VariableKey>();
  for (const raw of rawKeys) {
    const parsed = parseVariableKey(raw);
    if (!parsed.ok || !known.has(parsed.value)) {
      throw new CliError({
        code: VALIDATION_ERROR_CODES.invalidCommandInput,
        message: `--skip-key ${raw} does not name a Variable Key of this project.`,
        retryable: false,
      });
    }
    skipKeys.add(parsed.value);
  }
  return skipKeys;
}

/**
 * The migrate confirmation is scoped: only `--confirm-migrate` (or an interactive yes) satisfies
 * it, and generic `--yes` is rejected by design (ADR-0080) because it names a post-verification
 * local deletion an agent must not wave through.
 */
export async function requireMigrateConfirmation(
  flags: GlobalCliFlags,
  options: ProjectsMigrateCommandOptions,
  preview: MigratePreview,
  confirm: (prompt: string) => Promise<boolean>,
): Promise<void> {
  if (options.confirmMigrate) {
    return;
  }
  if (!flags.json && !flags.quiet) {
    process.stderr.write(`${previewLines(preview)}\n`);
  }
  if (!options.yes) {
    const confirmed = await confirm(
      `Migrate ${preview.projectId} to ${preview.host} and delete local copies after remote verification? [y/N] `,
    );
    if (confirmed) {
      return;
    }
  }
  throw new CliError(
    {
      code: CLI_ERROR_CODES.validationError,
      message: options.yes
        ? "--yes cannot confirm a Local Mode migration. Re-run with the scoped --confirm-migrate flag."
        : "Migration not confirmed. Re-run with --confirm-migrate or answer the interactive prompt.",
      retryable: false,
    },
    {
      data: { preview },
      remediation: actionableRemediation(CLI_ERROR_CODES.validationError, {
        suggestedFix:
          "Confirm the migration explicitly; it deletes local copies after every value is verified present remotely.",
        usage: [
          "insecur",
          "projects",
          "migrate",
          "--org-id",
          preview.organizationId,
          "--confirm-migrate",
        ],
      }),
    },
  );
}
