import { parseSuccessEnvelopeList } from "./envelope.js";
import { parseHighAssuranceChallengeEntry } from "./approval-items-parse.js";

/** Discriminated by opaque ID prefix (docs/web-console-ux.md §URLs). */
export type ConsoleApprovalItemKind = "high_assurance_challenge" | "approval_request";

/** Generic Human Approval Surface inbox row; AG6 Approval Requests slot in additively. */
export type ConsoleApprovalItem = ConsoleHighAssuranceChallengeItem | ConsoleApprovalRequestItem;

export interface ConsoleHighAssuranceChallengeItem {
  readonly kind: "high_assurance_challenge";
  readonly id: string;
  readonly intentCode: string;
  readonly projectId: string;
  readonly environmentId: string | null;
  readonly riskReasonCode: string;
  readonly requestedAt: string;
  readonly expiresAt: string;
  readonly requestingUserId: string | null;
  readonly requestingMachineIdentityId: string | null;
}

export interface ConsoleApprovalRequestItem {
  readonly kind: "approval_request";
  readonly id: string;
  readonly requestedAt: string;
  readonly status: "pending";
}

export interface ConsolePendingApprovals {
  readonly items: readonly ConsoleApprovalItem[];
}

/** Resolve inbox item kind from an approval deep-link id (`op_` vs `req_`). */
export function consoleApprovalItemKindFromId(id: string): ConsoleApprovalItemKind | null {
  if (id.startsWith("op_")) {
    return "high_assurance_challenge";
  }
  if (id.startsWith("req_")) {
    return "approval_request";
  }
  return null;
}

/**
 * Parse `GET /v1/orgs/:organizationId/high-assurance-challenges` for the console inbox. Returns
 * `null` for anything but the expected success envelope so loaders fail closed.
 */
export function parseOrgHighAssuranceChallengesBody(body: unknown): ConsolePendingApprovals | null {
  const challenges = parseSuccessEnvelopeList(body, "challenges", parseHighAssuranceChallengeEntry);
  if (challenges === null) {
    return null;
  }
  return { items: challenges };
}

export function approvalInboxPath(organizationId: string): string {
  return `/orgs/${organizationId}/approvals`;
}

/** Deep-link short form for one Human Approval Surface item (docs/web-console-ux.md §URLs). */
export function approvalDetailPath(organizationId: string, approvalId: string): string {
  return `/orgs/${organizationId}/approvals/${approvalId}`;
}
