import { createServerFn } from "@tanstack/react-start";
import {
  parseOrgInvitationsBody,
  parseOrgMembersBody,
  type ConsoleInvitation,
  type ConsoleMember,
} from "../console/people.js";
import { consoleRead, orgIdInput, type ConsoleRead } from "./console-read.js";

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
  .handler(({ data }): Promise<ConsoleRead<ConsolePeople>> =>
    consoleRead(async (api) => {
      const [membersBody, invitationsBody] = await Promise.all([
        api.orgMembers(data.organizationId),
        api.orgInvitations(data.organizationId),
      ]);
      const members = parseOrgMembersBody(membersBody);
      const invitations = parseOrgInvitationsBody(invitationsBody);
      if (members === null || invitations === null) {
        return null;
      }
      return { members, invitations };
    }),
  );
