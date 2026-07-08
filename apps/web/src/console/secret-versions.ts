import type { ConsolePrincipalChainActor } from "./actor-chain-label.js";
import { parsePrincipalChainActor } from "./principal-chain-actor.js";

const LIFECYCLE_STATES = new Set(["draft", "live", "retained", "discarded"]);

export interface ConsoleSecretVersionRow {
  readonly secretVersionId: string;
  readonly versionNumber: number;
  readonly lifecycleState: "draft" | "live" | "retained" | "discarded";
  readonly createdAt: string;
  readonly publishedAt?: string;
  readonly isCurrent: boolean;
  readonly isPublished: boolean;
  readonly setAt?: string;
  readonly setActor?: ConsolePrincipalChainActor;
}

export interface ConsoleSecretVersions {
  readonly secretId: string;
  readonly variableKey: string;
  readonly versions: readonly ConsoleSecretVersionRow[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function successEnvelopeData(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body) || body.ok !== true || !isRecord(body.data)) {
    return null;
  }
  return body.data;
}

function parseOptionalStringField(
  entry: Record<string, unknown>,
  field: string,
): string | undefined | null {
  const value = entry[field];
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" ? value : null;
}

function parseVersionScalars(entry: Record<string, unknown>): {
  secretVersionId: string;
  versionNumber: number;
  lifecycleState: ConsoleSecretVersionRow["lifecycleState"];
  createdAt: string;
  isCurrent: boolean;
  isPublished: boolean;
} | null {
  const lifecycleState = entry.lifecycleState;
  if (
    typeof entry.secretVersionId !== "string" ||
    typeof entry.versionNumber !== "number" ||
    typeof lifecycleState !== "string" ||
    !LIFECYCLE_STATES.has(lifecycleState) ||
    typeof entry.createdAt !== "string" ||
    typeof entry.isCurrent !== "boolean" ||
    typeof entry.isPublished !== "boolean"
  ) {
    return null;
  }
  return {
    secretVersionId: entry.secretVersionId,
    versionNumber: entry.versionNumber,
    lifecycleState: lifecycleState as ConsoleSecretVersionRow["lifecycleState"],
    createdAt: entry.createdAt,
    isCurrent: entry.isCurrent,
    isPublished: entry.isPublished,
  };
}

function parseVersionActor(
  entry: Record<string, unknown>,
): ConsolePrincipalChainActor | undefined | null {
  if (entry.setActor === undefined) {
    return undefined;
  }
  return parsePrincipalChainActor(entry.setActor);
}

function parseVersionOptionalFields(
  entry: Record<string, unknown>,
): Pick<ConsoleSecretVersionRow, "publishedAt" | "setAt" | "setActor"> | null {
  const publishedAt = parseOptionalStringField(entry, "publishedAt");
  const setAt = parseOptionalStringField(entry, "setAt");
  if (publishedAt === null || setAt === null) {
    return null;
  }
  const setActor = parseVersionActor(entry);
  if (setActor === null) {
    return null;
  }
  return {
    ...(publishedAt === undefined ? {} : { publishedAt }),
    ...(setAt === undefined ? {} : { setAt }),
    ...(setActor === undefined ? {} : { setActor }),
  };
}

function parseVersionRow(entry: unknown): ConsoleSecretVersionRow | null {
  if (!isRecord(entry)) {
    return null;
  }
  const scalars = parseVersionScalars(entry);
  if (scalars === null) {
    return null;
  }
  const optionalFields = parseVersionOptionalFields(entry);
  if (optionalFields === null) {
    return null;
  }
  return { ...scalars, ...optionalFields };
}

/**
 * Parse the environment-scoped secret version history envelope from the API hop. Returns `null`
 * for anything but the expected metadata-only success envelope.
 */
export function parseSecretVersionsBody(body: unknown): ConsoleSecretVersions | null {
  const data = successEnvelopeData(body);
  if (data === null) {
    return null;
  }
  if (typeof data.secretId !== "string" || typeof data.variableKey !== "string") {
    return null;
  }
  if (!Array.isArray(data.versions)) {
    return null;
  }
  const versions = data.versions.flatMap((entry) => {
    const parsed = parseVersionRow(entry);
    return parsed ? [parsed] : [];
  });
  if (versions.length !== data.versions.length) {
    return null;
  }
  return {
    secretId: data.secretId,
    variableKey: data.variableKey,
    versions,
  };
}
