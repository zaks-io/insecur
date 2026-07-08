import { Badge } from "@insecur/ui";
import { Link } from "@tanstack/react-router";
import { shortDate } from "../../console/projects.js";
import type { ConsoleSecretVersionRow } from "../../console/secret-versions.js";
import { ActorChain } from "../actor-chain.js";

function VersionStateBadges({ version }: { version: ConsoleSecretVersionRow }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {version.isCurrent ? <Badge variant="solid">Current</Badge> : null}
      {version.isPublished ? <Badge variant="outline">Published</Badge> : null}
      {version.lifecycleState !== "live" ? (
        <Badge variant="outline">{version.lifecycleState}</Badge>
      ) : null}
    </div>
  );
}

function VersionHistoryRow({ version }: { version: ConsoleSecretVersionRow }) {
  const setAt = version.setAt ?? version.createdAt;
  return (
    <tr className="border-t border-ink/20 first:border-t-0">
      <td className="px-4 py-3 align-top font-mono text-sm">v{version.versionNumber}</td>
      <td className="px-4 py-3 align-top font-mono text-xs text-muted-foreground">
        {shortDate(setAt)}
      </td>
      <td className="px-4 py-3 align-top">
        {version.setActor !== undefined ? (
          <ActorChain actor={version.setActor} />
        ) : (
          <span className="font-mono text-xs text-muted-foreground">unknown</span>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <VersionStateBadges version={version} />
      </td>
    </tr>
  );
}

/** Metadata-only version history table for one secret in one environment (INS-380). */
export function SecretVersionHistoryTable({
  versions,
}: {
  versions: readonly ConsoleSecretVersionRow[];
}) {
  return (
    <div className="mt-6 overflow-x-auto border-2 border-ink">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left">
            <th className="px-4 py-3 text-xs font-semibold tracking-[0.18em] uppercase">Version</th>
            <th className="px-4 py-3 text-xs font-semibold tracking-[0.18em] uppercase">Set at</th>
            <th className="px-4 py-3 text-xs font-semibold tracking-[0.18em] uppercase">Actor</th>
            <th className="px-4 py-3 text-xs font-semibold tracking-[0.18em] uppercase">State</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => (
            <VersionHistoryRow key={version.secretVersionId} version={version} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SecretDetailBreadcrumbs({
  orgId,
  projectId,
  environmentLabel,
  variableKey,
}: {
  orgId: string;
  projectId: string;
  environmentLabel: string;
  variableKey: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className="font-mono text-xs text-muted-foreground">
      <Link
        to="/orgs/$orgId/projects/$projectId/secrets"
        params={{ orgId, projectId }}
        className="hover:text-foreground hover:underline"
      >
        Secrets matrix
      </Link>
      <span className="mx-2">/</span>
      <span>{environmentLabel}</span>
      <span className="mx-2">/</span>
      <span className="text-foreground">{variableKey}</span>
    </nav>
  );
}
