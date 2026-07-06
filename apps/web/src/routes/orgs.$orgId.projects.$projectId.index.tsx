import { Badge } from "@insecur/ui";
import { createFileRoute } from "@tanstack/react-router";
import { ConsoleFramedRouteError } from "../components/console-route-error.js";
import { shortDate, type ConsoleEnvironment } from "../console/projects.js";
import { requireConsoleRead } from "../console/route-guards.js";
import { CliInvitation } from "../components/cli-invitation.js";
import { loadProjectEnvironments } from "../server/console-projects.js";

export const Route = createFileRoute("/orgs/$orgId/projects/$projectId/")({
  loader: async ({ params, location }) => {
    const environments = requireConsoleRead(
      await loadProjectEnvironments({
        data: { organizationId: params.orgId, projectId: params.projectId },
      }),
      location.href,
    );
    return { environments };
  },
  component: ProjectEnvironmentsPage,
  errorComponent: ConsoleFramedRouteError,
});

const HEADER_CELL = "px-4 py-3 text-xs font-semibold tracking-[0.18em] uppercase";

function EnvironmentsTable({ environments }: { environments: readonly ConsoleEnvironment[] }) {
  return (
    <div className="mt-6 overflow-x-auto border-2 border-ink">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left">
            <th className={HEADER_CELL}>Environment</th>
            <th className={HEADER_CELL}>Stage</th>
            <th className={HEADER_CELL}>Protection</th>
            <th className={HEADER_CELL}>Environment ID</th>
            <th className={HEADER_CELL}>Created</th>
          </tr>
        </thead>
        <tbody>
          {environments.map((environment) => (
            <tr key={environment.environmentId} className="border-t border-ink/20 first:border-t-0">
              <td className="px-4 py-3 font-medium">{environment.displayName}</td>
              <td className="px-4 py-3 text-muted-foreground">{environment.lifecycleStage}</td>
              <td className="px-4 py-3">
                {environment.isProtected ? (
                  <Badge variant="solid">Protected</Badge>
                ) : (
                  <span aria-hidden className="text-muted-foreground">
                    —
                  </span>
                )}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                {environment.environmentId}
              </td>
              <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-muted-foreground">
                {shortDate(environment.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectEnvironmentsPage() {
  const { environments } = Route.useLoaderData();

  if (environments.length === 0) {
    return (
      <CliInvitation
        title="No environments yet"
        command="insecur envs create"
        lead="Environments carry this project's secrets through development, preview, staging, and
          production. Create the first one from the project's repo:"
        hint="Protected environments demand approval before secrets move; mark production once it
          exists."
      />
    );
  }
  return <EnvironmentsTable environments={environments} />;
}
