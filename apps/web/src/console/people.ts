import { parseSuccessEnvelopeList } from "./envelope.js";

/**
 * Metadata-only member row for the console People register. `displayName` is null when the
 * member's admission carries none; `projectId` is null for organization-tier memberships.
 */
export interface ConsoleMember {
  readonly membershipId: string;
  readonly userId: string;
  readonly displayName: string | null;
  readonly rolePreset: string;
  readonly projectId: string | null;
  readonly createdAt: string;
}

/** Metadata-only pending invitation row: identifiers, role bundle, status, timestamp. No secrets. */
export interface ConsoleInvitation {
  readonly invitationId: string;
  readonly inviteeUserId: string;
  readonly inviteeDisplayName: string | null;
  readonly rolePreset: string;
  readonly status: "pending";
  readonly projectId: string | null;
  readonly createdAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/** True when both the display-name and project-id slots hold `string | null`. */
function nullableNameAndProject(name: unknown, project: unknown): boolean {
  return nullableString(name) && nullableString(project);
}

function parseMemberEntry(entry: unknown): ConsoleMember | null {
  if (!isRecord(entry)) {
    return null;
  }
  const { membershipId, userId, displayName, rolePreset, projectId, createdAt } = entry;
  if (
    typeof membershipId !== "string" ||
    typeof userId !== "string" ||
    typeof rolePreset !== "string" ||
    typeof createdAt !== "string" ||
    !nullableNameAndProject(displayName, projectId)
  ) {
    return null;
  }
  return {
    membershipId,
    userId,
    displayName: displayName as string | null,
    rolePreset,
    projectId: projectId as string | null,
    createdAt,
  };
}

function parseInvitationEntry(entry: unknown): ConsoleInvitation | null {
  if (!isRecord(entry)) {
    return null;
  }
  const {
    invitationId,
    inviteeUserId,
    inviteeDisplayName,
    rolePreset,
    status,
    projectId,
    createdAt,
  } = entry;
  if (
    typeof invitationId !== "string" ||
    typeof inviteeUserId !== "string" ||
    typeof rolePreset !== "string" ||
    typeof createdAt !== "string" ||
    status !== "pending" ||
    !nullableNameAndProject(inviteeDisplayName, projectId)
  ) {
    return null;
  }
  return {
    invitationId,
    inviteeUserId,
    inviteeDisplayName: inviteeDisplayName as string | null,
    rolePreset,
    status,
    projectId: projectId as string | null,
    createdAt,
  };
}

/**
 * Parse the `GET /v1/orgs/:organizationId/members` envelope from the API hop. Returns `null` for
 * anything but the expected success envelope so loaders fail closed to a metadata-safe not-found.
 */
export function parseOrgMembersBody(body: unknown): readonly ConsoleMember[] | null {
  return parseSuccessEnvelopeList(body, "members", parseMemberEntry);
}

/** Parse the `GET /v1/orgs/:organizationId/invitations` envelope; `null` fails closed. */
export function parseOrgInvitationsBody(body: unknown): readonly ConsoleInvitation[] | null {
  return parseSuccessEnvelopeList(body, "invitations", parseInvitationEntry);
}
