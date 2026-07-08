import {
  consoleApprovalItemKindFromId,
  type ConsoleApprovalRequestItem,
} from "./approval-items.js";
import { isRecord, optionalStringField, requiredStringField } from "./approval-parse-helpers.js";

function requiredPendingStatus(value: unknown): "pending" | null {
  return value === "pending" ? "pending" : null;
}

function parseRequiredApprovalRequestFields(
  entry: Record<string, unknown>,
): Omit<
  ConsoleApprovalRequestItem,
  "kind" | "operationId" | "requestingUserId" | "requestingMachineIdentityId"
> | null {
  const id = requiredStringField(entry, "approvalRequestId");
  const purpose = requiredStringField(entry, "purpose");
  const projectId = requiredStringField(entry, "projectId");
  const environmentId = requiredStringField(entry, "environmentId");
  const requestedAt = requiredStringField(entry, "requestedAt");
  const status = requiredPendingStatus(entry.status);
  if (
    id === null ||
    purpose === null ||
    projectId === null ||
    environmentId === null ||
    requestedAt === null ||
    status === null
  ) {
    return null;
  }
  if (consoleApprovalItemKindFromId(id) !== "approval_request") {
    return null;
  }
  return { id, purpose, projectId, environmentId, requestedAt, status };
}

export function parseApprovalRequestEntry(entry: unknown): ConsoleApprovalRequestItem | null {
  if (!isRecord(entry)) {
    return null;
  }
  const required = parseRequiredApprovalRequestFields(entry);
  if (required === null) {
    return null;
  }
  const operationId = optionalStringField(entry, "operationId");
  const requestingUserId = optionalStringField(entry, "requestingUserId");
  const requestingMachineIdentityId = optionalStringField(entry, "requestingMachineIdentityId");
  if (!operationId.ok || !requestingUserId.ok || !requestingMachineIdentityId.ok) {
    return null;
  }
  return {
    kind: "approval_request",
    ...required,
    operationId: operationId.value,
    requestingUserId: requestingUserId.value,
    requestingMachineIdentityId: requestingMachineIdentityId.value,
  };
}

/**
 * Parse `GET /v1/orgs/:organizationId/approval-requests` for the console inbox. Returns `null` for
 * anything but the expected success envelope so loaders fail closed.
 */
export function parseOrgApprovalRequestsBody(body: unknown): {
  readonly items: readonly ConsoleApprovalRequestItem[];
} | null {
  if (!isRecord(body) || body.ok !== true || !isRecord(body.data)) {
    return null;
  }
  const rows = body.data.approvalRequests;
  if (!Array.isArray(rows)) {
    return null;
  }
  const items: ConsoleApprovalRequestItem[] = [];
  for (const row of rows) {
    const parsed = parseApprovalRequestEntry(row);
    if (parsed === null) {
      return null;
    }
    items.push(parsed);
  }
  return { items };
}
