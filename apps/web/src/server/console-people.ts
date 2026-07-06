import { createServerFn } from "@tanstack/react-start";
import { parseConsoleReadEnvelope } from "../console/envelope.js";
import {
  parseOrgInvitationsBody,
  parseOrgMembersBody,
  type ConsoleInvitation,
  type ConsoleMember,
} from "../console/people.js";
import {
  consoleRead,
  consoleReadUnavailable,
  orgIdInput,
  type ConsoleRead,
} from "./console-read.js";

export interface ConsolePeople {
  readonly members: readonly ConsoleMember[];
  readonly invitations: readonly ConsoleInvitation[];
}

/**
 * The People section read (INS-373): members and pending invitations over the BFF scoped-token
 * hop (ADR-0051), one server round-trip for the page. Either read failing to parse fails the
 * whole page closed to a metadata-safe not-found.
 */
export const loadOrgPeople = createServerFn({ method: "GET" })
  .validator(orgIdInput)
  .handler(
    ({ data }): Promise<ConsoleRead<ConsolePeople>> =>
      consoleRead(async (api) => {
        const [membersBody, invitationsBody] = await Promise.all([
          api.orgMembers(data.organizationId),
          api.orgInvitations(data.organizationId),
        ]);
        const members = parseConsoleReadEnvelope(membersBody, parseOrgMembersBody);
        const invitations = parseConsoleReadEnvelope(invitationsBody, parseOrgInvitationsBody);
        if (members.kind === "unavailable" || invitations.kind === "unavailable") {
          return consoleReadUnavailable;
        }
        if (members.kind === "denied" || invitations.kind === "denied") {
          return null;
        }
        return { members: members.value, invitations: invitations.value };
      }),
  );
