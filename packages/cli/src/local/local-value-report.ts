import {
  LOCAL_ERROR_CODES,
  type EnvironmentId,
  type MissingValueRemediationEntry,
  type ProjectId,
  type VariableKey,
} from "@insecur/domain";
import type { LocalStore } from "@insecur/local-store";
import { CliError } from "../output/cli-error.js";
import { actionableRemediation } from "../output/cli-remediation.js";

/** Why values are absent on a fresh machine; required in human and JSON output. */
export const LOCAL_MODE_MACHINE_SCOPED_LINE =
  "Local Mode is machine-scoped: values do not sync between machines. " +
  "insecur login followed by insecur projects migrate is the sync path.";

interface MissingLocalValue {
  readonly variableKey: VariableKey;
  readonly displayName: string | null;
  readonly description: string | null;
  readonly generationHint: string | null;
  readonly secretsSet: readonly string[];
}

export interface LocalValueReport {
  readonly manifestKeyCount: number;
  readonly presentValueCount: number;
  readonly missingValues: readonly MissingLocalValue[];
}

const GENERATION_HINT_PATTERN = /^random(?::(\d+))?$/;

/** Exact fill command for one manifest key; `--generate` when the shape has a generation hint. */
export function secretsSetArgv(
  variableKey: VariableKey,
  generationHint: string | null,
): readonly string[] {
  const base = ["insecur", "secrets", "set", variableKey];
  const hint = generationHint === null ? null : GENERATION_HINT_PATTERN.exec(generationHint);
  if (hint === null) {
    return base;
  }
  const lengthBytes = hint[1];
  return lengthBytes === undefined
    ? [...base, "--generate", "random"]
    : [...base, "--generate", "random", "--length", lengthBytes];
}

export function localValueSummary(report: LocalValueReport): string {
  return `${String(report.presentValueCount)} of ${String(report.manifestKeyCount)} manifest keys have values on this machine.`;
}

/**
 * Metadata-only per-machine value report: every Secret Shape known for the
 * project against which of them have a Current Version in this machine's store.
 */
export async function buildLocalValueReport(
  store: LocalStore,
  projectId: ProjectId,
  environmentId: EnvironmentId,
): Promise<LocalValueReport> {
  const shapes = await store.projects.listSecretShapes(projectId);
  const metadata = await store.secretVersions.listSecretMetadata(projectId, environmentId);
  const secretIdsWithValue = new Set(
    metadata.filter((row) => row.hasCurrentVersion).map((row) => row.secretId),
  );
  const missingValues = shapes
    .filter((shape) => !secretIdsWithValue.has(shape.secretId))
    .map((shape) => ({
      variableKey: shape.variableKey,
      displayName: shape.displayName,
      description: shape.description,
      generationHint: shape.generationHint,
      secretsSet: secretsSetArgv(shape.variableKey, shape.generationHint),
    }));
  return {
    manifestKeyCount: shapes.length,
    presentValueCount: shapes.length - missingValues.length,
    missingValues,
  };
}

function missingValueRemediationEntries(
  report: LocalValueReport,
): readonly MissingValueRemediationEntry[] {
  return report.missingValues.map((missing) => ({
    variableKey: missing.variableKey,
    argv: missing.secretsSet,
  }));
}

/**
 * The stable `local.value_missing_on_machine` failure: names the requested key,
 * summarizes per-machine value presence, explains the machine-scoped store, and
 * carries one runnable `secrets set` argv per missing manifest key.
 */
export function valueMissingOnMachineError(
  requestedKey: VariableKey,
  report: LocalValueReport,
): CliError {
  return new CliError(
    {
      code: LOCAL_ERROR_CODES.valueMissingOnMachine,
      message:
        `Variable key ${requestedKey} has no value on this machine. ` +
        `${localValueSummary(report)} ${LOCAL_MODE_MACHINE_SCOPED_LINE}`,
      retryable: false,
    },
    {
      remediation: {
        ...actionableRemediation(LOCAL_ERROR_CODES.valueMissingOnMachine, {
          suggestedFix:
            "Set each missing manifest key on this machine with the exact commands below, " +
            "or log in and migrate this project for synced hosted custody.",
        }),
        missingValues: missingValueRemediationEntries(report),
        login: ["insecur", "login"],
        migrate: ["insecur", "projects", "migrate", "--confirm-migrate"],
      },
    },
  );
}
