import type { ConsoleAuditActor, ConsoleAuditEvent, ConsoleAuditResource } from "./audit-events.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseAuditDetailValue(value: unknown): string | number | boolean | null | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return undefined;
}

export function parseAuditDetails(value: unknown): ConsoleAuditEvent["details"] | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }
  const parsed: Record<string, string | number | boolean | null> = {};
  for (const [key, entry] of Object.entries(value)) {
    const detail = parseAuditDetailValue(entry);
    if (detail === undefined) {
      return null;
    }
    parsed[key] = detail;
  }
  return parsed;
}

function parseUserActor(value: Record<string, unknown>): ConsoleAuditActor | null {
  const userId = value.userId;
  if (userId !== undefined && typeof userId !== "string") {
    return null;
  }
  return userId === undefined ? { actorType: "user" } : { actorType: "user", userId };
}

function parseMachineActor(value: Record<string, unknown>): ConsoleAuditActor | null {
  const machineIdentityId = value.machineIdentityId;
  if (machineIdentityId !== undefined && typeof machineIdentityId !== "string") {
    return null;
  }
  return machineIdentityId === undefined
    ? { actorType: "machine" }
    : { actorType: "machine", machineIdentityId };
}

export function parseAuditActor(value: unknown): ConsoleAuditActor | null {
  if (!isRecord(value) || typeof value.actorType !== "string") {
    return null;
  }
  switch (value.actorType) {
    case "user":
      return parseUserActor(value);
    case "machine":
      return parseMachineActor(value);
    case "ci_exchange":
      return { actorType: "ci_exchange" };
    default:
      return null;
  }
}

export function parseAuditResource(value: unknown): ConsoleAuditResource | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.id !== "string") {
    return null;
  }
  return { type: value.type, id: value.id };
}

function parseAuditEventScalars(entry: Record<string, unknown>): {
  auditEventId: string;
  eventCode: string;
  outcome: "success" | "denied";
  projectId: string | null;
  environmentId: string | null;
  createdAt: string;
} | null {
  const { auditEventId, eventCode, outcome, projectId, environmentId, createdAt } = entry;
  if (
    typeof auditEventId !== "string" ||
    typeof eventCode !== "string" ||
    (outcome !== "success" && outcome !== "denied") ||
    !nullableString(projectId) ||
    !nullableString(environmentId) ||
    typeof createdAt !== "string"
  ) {
    return null;
  }
  return { auditEventId, eventCode, outcome, projectId, environmentId, createdAt };
}

function parseOptionalAuditResource(value: unknown): ConsoleAuditResource | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return parseAuditResource(value);
}

function isOptionalFieldValid(raw: unknown, parsed: unknown): boolean {
  return raw === undefined || raw === null || parsed !== null;
}

function parseAuditEventRelations(entry: Record<string, unknown>): {
  actor: ConsoleAuditActor;
  resource: ConsoleAuditResource | null;
  details: ConsoleAuditEvent["details"];
} | null {
  const parsedActor = parseAuditActor(entry.actor);
  const parsedResource = parseOptionalAuditResource(entry.resource);
  const parsedDetails = parseAuditDetails(entry.details);
  if (
    parsedActor === null ||
    !isOptionalFieldValid(entry.resource, parsedResource) ||
    !isOptionalFieldValid(entry.details, parsedDetails)
  ) {
    return null;
  }
  return {
    actor: parsedActor,
    resource: parsedResource ?? null,
    details: parsedDetails ?? null,
  };
}

export function parseAuditEventEntry(entry: unknown): ConsoleAuditEvent | null {
  if (!isRecord(entry)) {
    return null;
  }
  const scalars = parseAuditEventScalars(entry);
  const relations = parseAuditEventRelations(entry);
  if (scalars === null || relations === null) {
    return null;
  }
  return { ...scalars, ...relations };
}
