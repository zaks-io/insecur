import { parsePrincipalChainActor } from "./principal-chain-actor.js";
import type { ConsoleInjectionGrant, ConsoleInjectionGrantStatus } from "./project-access-types.js";
import { isRecord, parseOptionalStringField } from "./project-access-parse-helpers.js";

const GRANT_STATUSES = new Set(["active", "consumed", "expired", "revoked"]);
const REVOKED_REASONS = new Set(["tenant_suspension", "compromise_version_invalidation"]);

function isGrantStatus(value: string): value is ConsoleInjectionGrantStatus {
  return GRANT_STATUSES.has(value);
}

function parseVariableKeys(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || !value.every((key): key is string => typeof key === "string")) {
    return null;
  }
  return value;
}

function parseGrantScalars(
  entry: Record<string, unknown>,
): Pick<
  ConsoleInjectionGrant,
  "grantId" | "environmentId" | "variableKeys" | "status" | "createdAt" | "expiresAt"
> | null {
  const variableKeys = parseVariableKeys(entry.variableKeys);
  if (
    typeof entry.grantId !== "string" ||
    typeof entry.environmentId !== "string" ||
    variableKeys === null ||
    typeof entry.status !== "string" ||
    !isGrantStatus(entry.status) ||
    typeof entry.createdAt !== "string" ||
    typeof entry.expiresAt !== "string"
  ) {
    return null;
  }
  return {
    grantId: entry.grantId,
    environmentId: entry.environmentId,
    variableKeys,
    status: entry.status,
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
  };
}

function parseRevokedReason(
  value: unknown,
): "tenant_suspension" | "compromise_version_invalidation" | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" && REVOKED_REASONS.has(value)
    ? (value as "tenant_suspension" | "compromise_version_invalidation")
    : null;
}

function parseGrantActorField(
  entry: Record<string, unknown>,
  field: "issuedByActor" | "consumedByActor",
) {
  if (entry[field] === undefined) {
    return undefined;
  }
  return parsePrincipalChainActor(entry[field]);
}

function parseGrantTimestampScalars(
  entry: Record<string, unknown>,
): Pick<ConsoleInjectionGrant, "consumedAt" | "revokedAt"> | null {
  const consumedAt = parseOptionalStringField(entry, "consumedAt");
  const revokedAt = parseOptionalStringField(entry, "revokedAt");
  if (consumedAt === null || revokedAt === null) {
    return null;
  }
  return {
    ...(consumedAt === undefined ? {} : { consumedAt }),
    ...(revokedAt === undefined ? {} : { revokedAt }),
  };
}

function parseGrantRevokedReasonField(
  entry: Record<string, unknown>,
): Pick<ConsoleInjectionGrant, "revokedReason"> | null {
  const revokedReason = parseRevokedReason(entry.revokedReason);
  if (entry.revokedReason !== undefined && revokedReason === null) {
    return null;
  }
  return revokedReason === undefined || revokedReason === null ? {} : { revokedReason };
}

function parseGrantTimestampFields(
  entry: Record<string, unknown>,
): Pick<ConsoleInjectionGrant, "consumedAt" | "revokedAt" | "revokedReason"> | null {
  const timestamps = parseGrantTimestampScalars(entry);
  if (timestamps === null) {
    return null;
  }
  const revokedReason = parseGrantRevokedReasonField(entry);
  if (revokedReason === null) {
    return null;
  }
  return { ...timestamps, ...revokedReason };
}

function parseGrantActorFields(
  entry: Record<string, unknown>,
): Pick<ConsoleInjectionGrant, "issuedByActor" | "consumedByActor"> | null {
  const issuedByActor = parseGrantActorField(entry, "issuedByActor");
  const consumedByActor = parseGrantActorField(entry, "consumedByActor");
  if (issuedByActor === null || consumedByActor === null) {
    return null;
  }
  return {
    ...(issuedByActor === undefined ? {} : { issuedByActor }),
    ...(consumedByActor === undefined ? {} : { consumedByActor }),
  };
}

function parseGrantOptionalFields(
  entry: Record<string, unknown>,
): Pick<
  ConsoleInjectionGrant,
  "consumedAt" | "revokedAt" | "revokedReason" | "issuedByActor" | "consumedByActor"
> | null {
  const timestamps = parseGrantTimestampFields(entry);
  if (timestamps === null) {
    return null;
  }
  const actors = parseGrantActorFields(entry);
  if (actors === null) {
    return null;
  }
  return { ...timestamps, ...actors };
}

export function parseInjectionGrant(entry: unknown): ConsoleInjectionGrant | null {
  if (!isRecord(entry)) {
    return null;
  }
  const scalars = parseGrantScalars(entry);
  if (scalars === null) {
    return null;
  }
  const optionalFields = parseGrantOptionalFields(entry);
  if (optionalFields === null) {
    return null;
  }
  return { ...scalars, ...optionalFields };
}
