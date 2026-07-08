import {
  consoleApprovalItemKindFromId,
  type ConsoleHighAssuranceChallengeItem,
} from "./approval-items.js";
import { parseHighAssuranceChallengeEntry } from "./approval-items-parse.js";
import { isRecord, requiredBooleanField, requiredStringField } from "./approval-parse-helpers.js";

type ConsoleHighAssuranceChallengeLifecycleState =
  "not_required" | "required" | "pending" | "cleared" | "expired" | "consumed";

/** Detail read for one pending High-Assurance Challenge (INS-381). */
export interface ConsoleHighAssuranceChallengeDetail extends ConsoleHighAssuranceChallengeItem {
  readonly challengeId: string;
  readonly status: ConsoleHighAssuranceChallengeLifecycleState;
  readonly hasClearedEvidence: boolean;
}

const LIFECYCLE_STATES = new Set<ConsoleHighAssuranceChallengeLifecycleState>([
  "not_required",
  "required",
  "pending",
  "cleared",
  "expired",
  "consumed",
]);

function parseLifecycleState(value: unknown): ConsoleHighAssuranceChallengeLifecycleState | null {
  return typeof value === "string" &&
    LIFECYCLE_STATES.has(value as ConsoleHighAssuranceChallengeLifecycleState)
    ? (value as ConsoleHighAssuranceChallengeLifecycleState)
    : null;
}

export function parseHighAssuranceChallengeDetailEntry(
  entry: unknown,
): ConsoleHighAssuranceChallengeDetail | null {
  if (!isRecord(entry)) {
    return null;
  }
  const base = parseHighAssuranceChallengeEntry(entry);
  if (base === null) {
    return null;
  }
  const challengeId = requiredStringField(entry, "challengeId");
  const status = parseLifecycleState(entry.status);
  const hasClearedEvidence = requiredBooleanField(entry, "hasClearedEvidence");
  if (challengeId === null || status === null || hasClearedEvidence === null) {
    return null;
  }
  return { ...base, challengeId, status, hasClearedEvidence };
}

/**
 * Parse `GET /v1/orgs/:organizationId/high-assurance-challenges/:operationId` for the approval
 * detail page. Returns `null` for anything but the expected success envelope so loaders fail closed.
 */
export function parseOrgHighAssuranceChallengeDetailBody(
  body: unknown,
): ConsoleHighAssuranceChallengeDetail | null {
  if (!isRecord(body) || body.ok !== true || !isRecord(body.data)) {
    return null;
  }
  return parseHighAssuranceChallengeDetailEntry(body.data.challenge);
}

/** Resolve approval deep-link kind from the route param (`op_` vs `apr_`). */
export function consoleApprovalRouteKindFromId(
  id: string,
): ReturnType<typeof consoleApprovalItemKindFromId> | "unknown" {
  const kind = consoleApprovalItemKindFromId(id);
  return kind ?? "unknown";
}
