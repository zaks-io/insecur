import { Badge } from "@insecur/ui";
import { createFileRoute } from "@tanstack/react-router";
import { ConsoleFramedRouteError } from "../components/console-route-error.js";
import type { ConsoleInvitation, ConsoleMember } from "../console/people.js";
import { requireConsoleRead } from "../console/route-guards.js";
import { shortDate } from "../console/projects.js";
import { CliInvitation } from "../components/cli-invitation.js";
import { loadOrgPeople } from "../server/console-people.js";

export const Route = createFileRoute("/orgs/$orgId/people")({
  loader: async ({ params, location }) => {
    return requireConsoleRead(
      await loadOrgPeople({ data: { organizationId: params.orgId } }),
      location.href,
    );
  },
  component: PeoplePage,
  errorComponent: ConsoleFramedRouteError,
});

/** Primary identity line: Display Name when the admission carries one, opaque user id otherwise. */
function PersonName({ displayName, userId }: { displayName: string | null; userId: string }) {
  if (displayName === null) {
    return <span className="truncate font-mono text-base text-foreground">{userId}</span>;
  }
  return (
    <span className="truncate font-display text-lg leading-snug text-foreground">
      {displayName}
    </span>
  );
}

function RoleStamps({ rolePreset, projectId }: { rolePreset: string; projectId: string | null }) {
  return (
    <>
      <Badge>{rolePreset}</Badge>
      {projectId !== null ? <Badge>project-scoped</Badge> : null}
    </>
  );
}

function RegisterHeading({ title, count }: { title: string; count: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-3">
      <h2 className="font-display text-2xl leading-tight">{title}</h2>
      <p className="font-mono text-xs text-muted-foreground">{count}</p>
    </div>
  );
}

function MemberRegister({ members }: { members: readonly ConsoleMember[] }) {
  return (
    <ul className="mt-6 border-2 border-ink">
      {members.map((member, index) => (
        <li
          key={member.membershipId}
          className={`flex items-baseline justify-between gap-4 px-5 py-4 sm:px-6 ${
            index > 0 ? "border-t-2 border-ink" : ""
          }`}
        >
          <span className="min-w-0">
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <PersonName displayName={member.displayName} userId={member.userId} />
              <RoleStamps rolePreset={member.rolePreset} projectId={member.projectId} />
            </span>
            {member.displayName !== null ? (
              <span className="mt-1 block font-mono text-xs text-muted-foreground">
                {member.userId}
              </span>
            ) : null}
          </span>
          <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
            joined {shortDate(member.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function InvitationRegister({ invitations }: { invitations: readonly ConsoleInvitation[] }) {
  return (
    <ul className="mt-6 border-2 border-ink">
      {invitations.map((invitation, index) => (
        <li
          key={invitation.invitationId}
          className={`flex items-baseline justify-between gap-4 px-5 py-4 sm:px-6 ${
            index > 0 ? "border-t-2 border-ink" : ""
          }`}
        >
          <span className="min-w-0">
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <PersonName
                displayName={invitation.inviteeDisplayName}
                userId={invitation.inviteeUserId}
              />
              <RoleStamps rolePreset={invitation.rolePreset} projectId={invitation.projectId} />
            </span>
            {invitation.inviteeDisplayName !== null ? (
              <span className="mt-1 block font-mono text-xs text-muted-foreground">
                {invitation.inviteeUserId}
              </span>
            ) : null}
          </span>
          <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
            invited {shortDate(invitation.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Read-only People register (INS-373): members and pending invitations, metadata only. Mutations
 * (invite, revoke, role changes) stay CLI/API-first per docs/phasing.md, so this page renders
 * zero action affordances.
 */
function PeoplePage() {
  const { members, invitations } = Route.useLoaderData();
  const { orgId } = Route.useParams();
  const memberCount = members.length === 1 ? "1 member" : `${String(members.length)} members`;
  const invitationCount =
    invitations.length === 1 ? "1 pending" : `${String(invitations.length)} pending`;

  return (
    <section className="px-5 py-8 sm:px-8 sm:py-10">
      <header className="border-b-2 border-ink pb-6">
        <h1 className="font-display text-3xl leading-tight sm:text-4xl">People</h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {memberCount} · {invitationCount}
        </p>
      </header>

      <section className="mt-8" aria-label="Members">
        <RegisterHeading title="Members" count={memberCount} />
        {members.length === 0 ? (
          <p className="mt-6 max-w-prose text-sm leading-relaxed text-muted-foreground">
            No members are visible in this organization.
          </p>
        ) : (
          <MemberRegister members={members} />
        )}
      </section>

      <section className="mt-10" aria-label="Pending invitations">
        <RegisterHeading title="Pending invitations" count={invitationCount} />
        {invitations.length === 0 ? (
          <CliInvitation
            title="No pending invitations"
            command={`POST /v1/orgs/${orgId}/invitations`}
            lead="Every invitation grants an admitted user a role in this organization once they
              accept. Issue one through the API:"
            hint="Send inviteeUserId and rolePreset as JSON. Invitations are metadata only — there
              is no invite link or secret to share."
          />
        ) : (
          <InvitationRegister invitations={invitations} />
        )}
      </section>
    </section>
  );
}
