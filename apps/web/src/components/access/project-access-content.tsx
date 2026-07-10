import { Badge } from "@insecur/ui";
import type {
  ConsoleEnvironmentDeployKeyMethod,
  ConsoleGitHubActionsOidcMethod,
  ConsoleInjectionGrant,
  ConsoleMachineIdentity,
} from "../../console/project-access.js";
import { shortDate } from "../../console/projects.js";
import { ActorChain } from "../actor-chain.js";

function RegisterHeading({ title, count }: { title: string; count: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
      <h2 className="text-2xl font-semibold tracking-tight leading-tight">{title}</h2>
      <p className="font-mono text-xs text-muted-foreground">{count}</p>
    </div>
  );
}

function AuthMethodBadges({ method }: { method: ConsoleGitHubActionsOidcMethod }) {
  return (
    <>
      <Badge>GitHub Actions OIDC</Badge>
      <Badge>{method.status}</Badge>
      {method.githubEnvironment !== null ? <Badge>{method.githubEnvironment}</Badge> : null}
    </>
  );
}

function DeployKeyBadges({ method }: { method: ConsoleEnvironmentDeployKeyMethod }) {
  return (
    <>
      <Badge>Deploy key</Badge>
      <Badge>{method.status}</Badge>
      {method.nonExpiring ? <Badge>non-expiring</Badge> : null}
    </>
  );
}

function OidcMethodRow({ method }: { method: ConsoleGitHubActionsOidcMethod }) {
  return (
    <li className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <AuthMethodBadges method={method} />
      </div>
      <p className="mt-2 font-mono text-xs text-muted-foreground">{method.githubRepository}</p>
      {method.environmentId !== null ? (
        <p className="mt-1 font-mono text-xs text-muted-foreground">env {method.environmentId}</p>
      ) : null}
    </li>
  );
}

function DeployKeyMethodRow({ method }: { method: ConsoleEnvironmentDeployKeyMethod }) {
  return (
    <li className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <DeployKeyBadges method={method} />
      </div>
      <p className="mt-2 font-mono text-xs text-muted-foreground">env {method.environmentId}</p>
      {method.expiresAt !== null ? (
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          expires {shortDate(method.expiresAt)}
        </p>
      ) : null}
    </li>
  );
}

function MachineIdentityAuthMethods({ identity }: { identity: ConsoleMachineIdentity }) {
  const authMethodCount =
    identity.githubActionsOidcMethods.length + identity.environmentDeployKeyMethods.length;

  if (authMethodCount === 0) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        No auth methods configured for this project.
      </p>
    );
  }

  return (
    <ul className="mt-4 space-y-3">
      {identity.githubActionsOidcMethods.map((method) => (
        <OidcMethodRow key={method.authMethodId} method={method} />
      ))}
      {identity.environmentDeployKeyMethods.map((method) => (
        <DeployKeyMethodRow key={method.authMethodId} method={method} />
      ))}
    </ul>
  );
}

function MachineIdentityCard({ identity }: { identity: ConsoleMachineIdentity }) {
  return (
    <li className="rounded-xl border border-border bg-card px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold tracking-tight leading-snug text-foreground">
            {identity.displayName}
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {identity.machineIdentityId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{identity.status}</Badge>
          <span className="font-mono text-xs text-muted-foreground">
            created {shortDate(identity.createdAt)}
          </span>
        </div>
      </div>
      <MachineIdentityAuthMethods identity={identity} />
    </li>
  );
}

function GrantStatusBadge({ status }: { status: ConsoleInjectionGrant["status"] }) {
  return <Badge>{status}</Badge>;
}

function InjectionGrantRow({ grant }: { grant: ConsoleInjectionGrant }) {
  const variableKeys = grant.variableKeys.join(", ");

  return (
    <li className="rounded-xl border border-border bg-card px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm text-foreground">{grant.grantId}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">env {grant.environmentId}</p>
        </div>
        <GrantStatusBadge status={grant.status} />
      </div>

      <p className="mt-3 font-mono text-xs text-muted-foreground">{variableKeys}</p>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
            Issued
          </dt>
          <dd className="mt-1">
            {grant.issuedByActor !== undefined ? (
              <ActorChain actor={grant.issuedByActor} />
            ) : (
              <span className="font-mono text-xs text-muted-foreground">—</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
            Consumed
          </dt>
          <dd className="mt-1">
            {grant.consumedByActor !== undefined ? (
              <ActorChain actor={grant.consumedByActor} />
            ) : (
              <span className="font-mono text-xs text-muted-foreground">—</span>
            )}
          </dd>
        </div>
      </dl>

      <p className="mt-4 font-mono text-xs text-muted-foreground">
        created {shortDate(grant.createdAt)} · expires {shortDate(grant.expiresAt)}
        {grant.consumedAt !== undefined ? ` · consumed ${shortDate(grant.consumedAt)}` : ""}
        {grant.revokedAt !== undefined ? ` · revoked ${shortDate(grant.revokedAt)}` : ""}
      </p>
    </li>
  );
}

export function ProjectAccessContent({
  machineIdentities,
  grants,
}: {
  readonly machineIdentities: readonly ConsoleMachineIdentity[];
  readonly grants: readonly ConsoleInjectionGrant[];
}) {
  const identityCount =
    machineIdentities.length === 1
      ? "1 machine identity"
      : `${String(machineIdentities.length)} machine identities`;
  const grantCount = grants.length === 1 ? "1 grant" : `${String(grants.length)} grants`;

  return (
    <div className="mt-8 space-y-10">
      <section aria-label="Machine identities">
        <RegisterHeading title="Machine identities" count={identityCount} />
        {machineIdentities.length === 0 ? (
          <p className="mt-6 max-w-prose text-sm leading-relaxed text-muted-foreground">
            No machine identities are bound to this project yet.
          </p>
        ) : (
          <ul className="mt-6 space-y-4">
            {machineIdentities.map((identity) => (
              <MachineIdentityCard key={identity.machineIdentityId} identity={identity} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Runtime injection grants">
        <RegisterHeading title="Runtime injection grants" count={grantCount} />
        {grants.length === 0 ? (
          <p className="mt-6 max-w-prose text-sm leading-relaxed text-muted-foreground">
            No injection grants have been issued for this project yet.
          </p>
        ) : (
          <ul className="mt-6 space-y-4">
            {grants.map((grant) => (
              <InjectionGrantRow key={grant.grantId} grant={grant} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
