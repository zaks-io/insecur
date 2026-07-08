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

function parseAuditDetails(value: unknown): ConsoleAuditEvent["details"] | null | undefined {
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

function parseAuditActor(value: unknown): ConsoleAuditActor | null {
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

function parseAuditResource(value: unknown): ConsoleAuditResource | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.id !== "string") {
    return null;
  }
  return { type: value.type, id: value.id };
}

function parseAuditOutcome(value: unknown): "success" | "denied" | null {
  if (value === "success" || value === "denied") {
    return value;
  }
  return null;
}

function parseAuditScopeFields(entry: Record<string, unknown>): {
  projectId: string | null;
  environmentId: string | null;
  requestId: string | null;
  operationId: string | null;
} | null {
  const { projectId, environmentId, requestId, operationId } = entry;
  if (
    !nullableString(projectId) ||
    !nullableString(environmentId) ||
    !nullableString(requestId) ||
    !nullableString(operationId)
  ) {
    return null;
  }
  return { projectId, environmentId, requestId, operationId };
}

function parseAuditEventScalars(entry: Record<string, unknown>): {
  auditEventId: string;
  eventCode: string;
  outcome: "success" | "denied";
  resultCode: string;
  projectId: string | null;
  environmentId: string | null;
  requestId: string | null;
  operationId: string | null;
  createdAt: string;
} | null {
  const outcome = parseAuditOutcome(entry.outcome);
  const { auditEventId, eventCode, resultCode, createdAt } = entry;
  const scope = parseAuditScopeFields(entry);
  if (
    typeof auditEventId !== "string" ||
    typeof eventCode !== "string" ||
    outcome === null ||
    typeof resultCode !== "string" ||
    typeof createdAt !== "string" ||
    scope === null
  ) {
    return null;
  }
  return { auditEventId, eventCode, outcome, resultCode, createdAt, ...scope };
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
  relatedResource: ConsoleAuditResource | null;
  details: ConsoleAuditEvent["details"];
} | null {
  const parsedActor = parseAuditActor(entry.actor);
  const parsedResource = parseOptionalAuditResource(entry.resource);
  const parsedRelatedResource = parseOptionalAuditResource(entry.relatedResource);
  const parsedDetails = parseAuditDetails(entry.details);
  if (
    parsedActor === null ||
    !isOptionalFieldValid(entry.resource, parsedResource) ||
    !isOptionalFieldValid(entry.relatedResource, parsedRelatedResource) ||
    !isOptionalFieldValid(entry.details, parsedDetails)
  ) {
    return null;
  }
  return {
    actor: parsedActor,
    resource: parsedResource ?? null,
    relatedResource: parsedRelatedResource ?? null,
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
