import {
  consoleApprovalItemKindFromId,
  type ConsoleHighAssuranceChallengeItem,
} from "./approval-items.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredStringField(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function optionalStringField(
  row: Record<string, unknown>,
  key: string,
): { readonly ok: true; readonly value: string | null } | { readonly ok: false } {
  const value = row[key];
  if (value === undefined) {
    return { ok: true, value: null };
  }
  if (typeof value === "string") {
    return { ok: true, value };
  }
  return { ok: false };
}

function parseRequiredChallengeFields(
  entry: Record<string, unknown>,
): Omit<
  ConsoleHighAssuranceChallengeItem,
  "kind" | "environmentId" | "requestingUserId" | "requestingMachineIdentityId"
> | null {
  const id = requiredStringField(entry, "operationId");
  const intentCode = requiredStringField(entry, "intentCode");
  const projectId = requiredStringField(entry, "projectId");
  const riskReasonCode = requiredStringField(entry, "riskReasonCode");
  const requestedAt = requiredStringField(entry, "requestedAt");
  const expiresAt = requiredStringField(entry, "expiresAt");
  if (
    id === null ||
    intentCode === null ||
    projectId === null ||
    riskReasonCode === null ||
    requestedAt === null ||
    expiresAt === null
  ) {
    return null;
  }
  if (consoleApprovalItemKindFromId(id) !== "high_assurance_challenge") {
    return null;
  }
  return { id, intentCode, projectId, riskReasonCode, requestedAt, expiresAt };
}

export function parseHighAssuranceChallengeEntry(
  entry: unknown,
): ConsoleHighAssuranceChallengeItem | null {
  if (!isRecord(entry)) {
    return null;
  }
  const required = parseRequiredChallengeFields(entry);
  if (required === null) {
    return null;
  }
  const environmentId = optionalStringField(entry, "environmentId");
  const requestingUserId = optionalStringField(entry, "requestingUserId");
  const requestingMachineIdentityId = optionalStringField(entry, "requestingMachineIdentityId");
  if (!environmentId.ok || !requestingUserId.ok || !requestingMachineIdentityId.ok) {
    return null;
  }
  return {
    kind: "high_assurance_challenge",
    ...required,
    environmentId: environmentId.value,
    requestingUserId: requestingUserId.value,
    requestingMachineIdentityId: requestingMachineIdentityId.value,
  };
}
