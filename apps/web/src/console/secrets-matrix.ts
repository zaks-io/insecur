import type { EnvironmentLifecycleStage } from "@insecur/domain";
import { isEnvironmentLifecycleStage } from "@insecur/domain";
import type { ConsoleEnvironment } from "./projects.js";

/** Metadata-only matrix cell: presence, version pointer, and last-set actor/time. */
export interface ConsoleSecretMatrixCell {
  readonly environmentId: string;
  readonly present: boolean;
  readonly secretId?: string;
  readonly versionNumber?: number;
  readonly secretVersionId?: string;
  readonly lifecycleState?: "draft" | "live" | "retained" | "discarded";
  readonly lastSetAt?: string;
  readonly lastSetActor?: ConsoleSecretMatrixLastSetActor;
}

export interface ConsoleSecretMatrixLastSetActor {
  readonly actorType: "user" | "machine" | "ci_exchange";
  readonly userId?: string;
  readonly machineIdentityId?: string;
}

export interface ConsoleSecretMatrixRow {
  readonly variableKey: string;
  readonly cells: readonly ConsoleSecretMatrixCell[];
}

/** Full project secrets matrix payload for the console headline view. */
export interface ConsoleSecretsMatrix {
  readonly environments: readonly ConsoleEnvironment[];
  readonly rows: readonly ConsoleSecretMatrixRow[];
}

const LIFECYCLE_STATES = new Set(["draft", "live", "retained", "discarded"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseLifecycleStage(value: unknown): EnvironmentLifecycleStage | null {
  return typeof value === "string" && isEnvironmentLifecycleStage(value) ? value : null;
}

function parseEnvironmentEntry(entry: unknown): ConsoleEnvironment | null {
  if (!isRecord(entry)) {
    return null;
  }
  const stage = parseLifecycleStage(entry.lifecycleStage);
  if (
    stage === null ||
    typeof entry.environmentId !== "string" ||
    typeof entry.displayName !== "string" ||
    typeof entry.isProtected !== "boolean" ||
    typeof entry.createdAt !== "string"
  ) {
    return null;
  }
  return {
    environmentId: entry.environmentId,
    displayName: entry.displayName,
    lifecycleStage: stage,
    isProtected: entry.isProtected,
    createdAt: entry.createdAt,
  };
}

function parseUserLastSetActor(
  entry: Record<string, unknown>,
): ConsoleSecretMatrixLastSetActor | null {
  if (entry.userId !== undefined && typeof entry.userId !== "string") {
    return null;
  }
  return {
    actorType: "user",
    ...(typeof entry.userId === "string" ? { userId: entry.userId } : {}),
  };
}

function parseMachineLastSetActor(
  entry: Record<string, unknown>,
): ConsoleSecretMatrixLastSetActor | null {
  if (typeof entry.machineIdentityId !== "string") {
    return null;
  }
  return { actorType: "machine", machineIdentityId: entry.machineIdentityId };
}

function parseLastSetActor(entry: unknown): ConsoleSecretMatrixLastSetActor | null {
  if (!isRecord(entry) || typeof entry.actorType !== "string") {
    return null;
  }
  switch (entry.actorType) {
    case "user":
      return parseUserLastSetActor(entry);
    case "machine":
      return parseMachineLastSetActor(entry);
    case "ci_exchange":
      return { actorType: "ci_exchange" };
    default:
      return null;
  }
}

function parseAbsentMatrixCell(environmentId: string): ConsoleSecretMatrixCell {
  return { environmentId, present: false };
}

type SecretLifecycleState = NonNullable<ConsoleSecretMatrixCell["lifecycleState"]>;

function parseLifecycleState(value: unknown): SecretLifecycleState | null {
  return typeof value === "string" && LIFECYCLE_STATES.has(value)
    ? (value as SecretLifecycleState)
    : null;
}

function parsePresentMatrixFields(entry: Record<string, unknown>): {
  readonly secretId: string;
  readonly versionNumber: number;
  readonly secretVersionId: string;
  readonly lifecycleState: SecretLifecycleState;
  readonly lastSetAt: string;
} | null {
  const lifecycleState = parseLifecycleState(entry.lifecycleState);
  if (
    typeof entry.secretId !== "string" ||
    typeof entry.versionNumber !== "number" ||
    typeof entry.secretVersionId !== "string" ||
    lifecycleState === null ||
    typeof entry.lastSetAt !== "string"
  ) {
    return null;
  }
  return {
    secretId: entry.secretId,
    versionNumber: entry.versionNumber,
    secretVersionId: entry.secretVersionId,
    lifecycleState,
    lastSetAt: entry.lastSetAt,
  };
}

function parsePresentMatrixCell(
  entry: Record<string, unknown>,
  environmentId: string,
): ConsoleSecretMatrixCell | null {
  const fields = parsePresentMatrixFields(entry);
  if (fields === null) {
    return null;
  }
  const lastSetActor =
    entry.lastSetActor === undefined ? undefined : parseLastSetActor(entry.lastSetActor);
  if (entry.lastSetActor !== undefined && lastSetActor === null) {
    return null;
  }
  const baseCell: ConsoleSecretMatrixCell = {
    environmentId,
    present: true,
    ...fields,
  };
  if (lastSetActor === undefined || lastSetActor === null) {
    return baseCell;
  }
  return { ...baseCell, lastSetActor };
}

function parseMatrixCell(entry: unknown): ConsoleSecretMatrixCell | null {
  if (!isRecord(entry)) {
    return null;
  }
  if (typeof entry.environmentId !== "string" || typeof entry.present !== "boolean") {
    return null;
  }
  if (!entry.present) {
    return parseAbsentMatrixCell(entry.environmentId);
  }
  return parsePresentMatrixCell(entry, entry.environmentId);
}

function parseMatrixRow(entry: unknown): ConsoleSecretMatrixRow | null {
  if (!isRecord(entry)) {
    return null;
  }
  if (typeof entry.variableKey !== "string" || !Array.isArray(entry.cells)) {
    return null;
  }
  const cells = entry.cells.map(parseMatrixCell);
  if (!cells.every((cell): cell is ConsoleSecretMatrixCell => cell !== null)) {
    return null;
  }
  return { variableKey: entry.variableKey, cells };
}

function successEnvelopeData(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body) || body.ok !== true || !isRecord(body.data)) {
    return null;
  }
  return body.data;
}

/**
 * Parse the `GET .../projects/:projectId/secrets` envelope from the API hop. Returns `null` for
 * anything but the expected success envelope so loaders fail closed to a metadata-safe not-found.
 */
export function parseProjectSecretsBody(body: unknown): ConsoleSecretsMatrix | null {
  const data = successEnvelopeData(body);
  if (data === null) {
    return null;
  }
  if (!Array.isArray(data.environments) || !Array.isArray(data.rows)) {
    return null;
  }
  const environments = data.environments.map(parseEnvironmentEntry);
  const rows = data.rows.map(parseMatrixRow);
  if (
    !environments.every((entry): entry is ConsoleEnvironment => entry !== null) ||
    !rows.every((entry): entry is ConsoleSecretMatrixRow => entry !== null)
  ) {
    return null;
  }
  return { environments, rows };
}

/** True when a row's present cells disagree on version or some environments are missing the secret. */
export function secretMatrixRowHasDrift(row: ConsoleSecretMatrixRow): boolean {
  const presentCells = row.cells.filter((cell) => cell.present);
  if (presentCells.length === 0) {
    return false;
  }
  if (presentCells.length !== row.cells.length) {
    return true;
  }
  const versions = new Set(
    presentCells
      .map((cell) => cell.versionNumber)
      .filter((version): version is number => version !== undefined),
  );
  return versions.size > 1;
}
