import { parseSuccessEnvelopeList } from "./envelope.js";

/** Metadata-only audit actor coordinate from the tenant audit query API. */
interface ConsoleAuditActor {
  readonly actorType: "user" | "machine" | "ci_exchange";
  readonly userId?: string;
  readonly machineIdentityId?: string;
}

interface ConsoleAuditResource {
  readonly type: string;
  readonly id: string;
}

/** Metadata-only audit event row for the console event log. */
export interface ConsoleAuditEvent {
  readonly auditEventId: string;
  readonly eventCode: string;
  readonly outcome: "success" | "denied";
  readonly resultCode: string;
  readonly actor: ConsoleAuditActor;
  readonly projectId: string | null;
  readonly environmentId: string | null;
  readonly resource: ConsoleAuditResource | null;
  readonly relatedResource: ConsoleAuditResource | null;
  readonly requestId: string | null;
  readonly operationId: string | null;
  readonly details: Readonly<Record<string, string | number | boolean | null>> | null;
  readonly createdAt: string;
}

export interface ConsoleAuditPage {
  readonly events: readonly ConsoleAuditEvent[];
  readonly nextCursor: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseActorType(value: unknown): ConsoleAuditActor["actorType"] | null {
  if (value === "user" || value === "machine" || value === "ci_exchange") {
    return value;
  }
  return null;
}

function parseOptionalActorId(value: unknown): string | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" ? value : null;
}

function parseAuditActor(value: unknown): ConsoleAuditActor | null {
  if (!isRecord(value)) {
    return null;
  }
  const actorType = parseActorType(value.actorType);
  const userId = parseOptionalActorId(value.userId);
  const machineIdentityId = parseOptionalActorId(value.machineIdentityId);
  if (actorType === null || userId === null || machineIdentityId === null) {
    return null;
  }
  return {
    actorType,
    ...(userId === undefined ? {} : { userId }),
    ...(machineIdentityId === undefined ? {} : { machineIdentityId }),
  };
}

function parseAuditResource(value: unknown): ConsoleAuditResource | null {
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.id !== "string") {
    return null;
  }
  return { type: value.type, id: value.id };
}

function parseAuditDetails(
  value: unknown,
): Readonly<Record<string, string | number | boolean | null>> | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }
  for (const entry of Object.values(value)) {
    if (
      entry !== null &&
      typeof entry !== "string" &&
      typeof entry !== "number" &&
      typeof entry !== "boolean"
    ) {
      return null;
    }
  }
  return value as Readonly<Record<string, string | number | boolean | null>>;
}

function parseAuditScopeFields(entry: Record<string, unknown>): {
  projectId: string | null;
  environmentId: string | null;
  requestId: string | null;
  operationId: string | null;
} | null {
  const { projectId, environmentId, requestId, operationId } = entry;
  if (
    !isNullableString(projectId) ||
    !isNullableString(environmentId) ||
    !isNullableString(requestId) ||
    !isNullableString(operationId)
  ) {
    return null;
  }
  return { projectId, environmentId, requestId, operationId };
}

function parseAuditEventCoreFields(entry: Record<string, unknown>): {
  auditEventId: string;
  eventCode: string;
  outcome: "success" | "denied";
  resultCode: string;
  createdAt: string;
} | null {
  const { auditEventId, eventCode, outcome, resultCode, createdAt } = entry;
  if (
    typeof auditEventId !== "string" ||
    typeof eventCode !== "string" ||
    (outcome !== "success" && outcome !== "denied") ||
    typeof resultCode !== "string" ||
    typeof createdAt !== "string"
  ) {
    return null;
  }
  return { auditEventId, eventCode, outcome, resultCode, createdAt };
}

function parseNullableAuditResource(value: unknown): ConsoleAuditResource | null | undefined {
  if (value === null) {
    return null;
  }
  if (value === undefined) {
    return undefined;
  }
  return parseAuditResource(value);
}

function parseAuditResources(entry: Record<string, unknown>): {
  resource: ConsoleAuditResource | null;
  relatedResource: ConsoleAuditResource | null;
} | null {
  const resource = parseNullableAuditResource(entry.resource);
  const relatedResource = parseNullableAuditResource(entry.relatedResource);
  if (resource === undefined || relatedResource === undefined) {
    return null;
  }
  return { resource, relatedResource };
}

function hasInvalidAuditDetails(entry: Record<string, unknown>): boolean {
  return (
    entry.details !== undefined &&
    entry.details !== null &&
    parseAuditDetails(entry.details) === null
  );
}

function parseAuditEventEntry(entry: unknown): ConsoleAuditEvent | null {
  if (!isRecord(entry)) {
    return null;
  }
  const core = parseAuditEventCoreFields(entry);
  const actor = parseAuditActor(entry.actor);
  const scope = parseAuditScopeFields(entry);
  const resources = parseAuditResources(entry);
  if (core === null || actor === null || scope === null || resources === null) {
    return null;
  }
  if (hasInvalidAuditDetails(entry)) {
    return null;
  }
  const details = entry.details === undefined ? null : parseAuditDetails(entry.details);

  return {
    ...core,
    actor,
    projectId: scope.projectId,
    environmentId: scope.environmentId,
    resource: resources.resource,
    relatedResource: resources.relatedResource,
    requestId: scope.requestId,
    operationId: scope.operationId,
    details,
  };
}

function successEnvelopeField(body: unknown, field: string): unknown {
  if (!isRecord(body) || body.ok !== true || !isRecord(body.data)) {
    return undefined;
  }
  return body.data[field];
}

/**
 * Parse the `GET /v1/orgs/:organizationId/audit-events` envelope from the API hop. Returns `null`
 * for anything but the expected success envelope so loaders fail closed to a metadata-safe
 * not-found.
 */
export function parseAuditEventsBody(body: unknown): ConsoleAuditPage | null {
  const events = parseSuccessEnvelopeList(body, "events", parseAuditEventEntry);
  if (events === null) {
    return null;
  }
  const nextCursorRaw = successEnvelopeField(body, "nextCursor");
  if (nextCursorRaw !== null && typeof nextCursorRaw !== "string") {
    return null;
  }
  return {
    events,
    nextCursor: typeof nextCursorRaw === "string" ? nextCursorRaw : null,
  };
}
