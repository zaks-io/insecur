import {
  IMPORT_ERROR_CODES,
  MIGRATE_ERROR_CODES,
  SECRET_ERROR_CODES,
  type VariableKey,
} from "@insecur/domain";
import { CliError } from "../output/cli-error.js";
import { errorTypeUri } from "../output/error-type-uri.js";
import type { LocalMigrateSnapshot } from "../local/migrate-local-snapshot.js";
import type { MigrateCloudTarget } from "./projects-migrate-remote.js";

/** Which reconcile step observed the divergence; only the preflight path is provably write-free. */
export type DivergencePhase = "preflight" | "post_write_verify";

function rerunArgv(
  target: MigrateCloudTarget,
  divergedKeys: readonly VariableKey[],
): readonly string[] {
  return [
    "insecur",
    "projects",
    "migrate",
    "--org-id",
    target.organizationId,
    "--confirm-migrate",
    ...divergedKeys.flatMap((key) => ["--skip-key", key]),
  ];
}

function overwriteArgv(
  target: MigrateCloudTarget,
  snapshot: LocalMigrateSnapshot,
  variableKey: string,
): readonly string[] {
  return [
    "insecur",
    "secrets",
    "set",
    variableKey,
    "--value-stdin",
    "--host",
    target.host,
    "--org-id",
    target.organizationId,
    "--project-id",
    snapshot.projectId,
    "--env-id",
    snapshot.environmentId,
  ];
}

function divergenceMessage(divergedKeys: readonly VariableKey[], phase: DivergencePhase): string {
  return (
    `Remote values diverge from local copies for ${String(divergedKeys.length)} key(s): ` +
    `${divergedKeys.join(", ")}. ` +
    (phase === "preflight"
      ? "Nothing was written remotely and nothing was deleted locally."
      : "The value changed remotely during migration verification; nothing was deleted locally and the command is re-runnable.")
  );
}

/** Exact resolution commands for a divergence: keep-remote rerun, or explicit overwrite. */
export function remoteDivergedError(
  target: MigrateCloudTarget,
  snapshot: LocalMigrateSnapshot,
  divergedKeys: readonly VariableKey[],
  phase: DivergencePhase,
): CliError {
  return new CliError(
    {
      code: MIGRATE_ERROR_CODES.remoteDiverged,
      message: divergenceMessage(divergedKeys, phase),
      retryable: false,
    },
    {
      data: {
        divergedKeys: divergedKeys.map((variableKey) => ({
          variableKey,
          code: SECRET_ERROR_CODES.possessionMismatch,
        })),
      },
      remediation: {
        type: errorTypeUri(MIGRATE_ERROR_CODES.remoteDiverged),
        suggestedFix:
          "Keep each remote value by re-running with --skip-key, or overwrite it remotely with an explicit secrets set — a separate human decision. Migrate never overwrites remote values.",
        usage: rerunArgv(target, divergedKeys),
        secretsSet: overwriteArgv(target, snapshot, "<variable-key>"),
      },
    },
  );
}

/**
 * A remote Secret Shape exists with no Current Version (a half-created remote from a crash inside
 * the server's write). The blind write's `createOnly` guard cannot distinguish this from a live
 * value, and dropping the guard would open a write-after-check overwrite race, so migrate fails
 * loud with the exact hosted overwrite command instead (server-side conditional tracked as
 * INS-609).
 */
export function halfCreatedRemoteShapeError(
  target: MigrateCloudTarget,
  snapshot: LocalMigrateSnapshot,
  variableKey: VariableKey,
): CliError {
  return new CliError(
    {
      code: IMPORT_ERROR_CODES.existingSecret,
      message:
        `A remote Secret Shape for ${variableKey} exists without a Current Version, so the ` +
        "no-overwrite write guard cannot be applied safely. Nothing was deleted locally. " +
        "Set the value explicitly on the Hosted Instance, then re-run the migration.",
      retryable: false,
    },
    {
      remediation: {
        type: errorTypeUri(IMPORT_ERROR_CODES.existingSecret),
        suggestedFix:
          "Write the value explicitly against the Hosted Instance target, then re-run migrate; the possession check will report it as already in sync.",
        secretsSet: overwriteArgv(target, snapshot, variableKey),
        usage: rerunArgv(target, []),
      },
    },
  );
}
