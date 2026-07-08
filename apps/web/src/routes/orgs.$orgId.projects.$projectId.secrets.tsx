import { createFileRoute } from "@tanstack/react-router";
import { CliInvitation } from "../components/cli-invitation.js";
import { ConsoleFramedRouteError } from "../components/console-route-error.js";
import { SecretsMatrixTable } from "../components/secrets/secrets-matrix-table.js";
import { requireConsoleRead } from "../console/route-guards.js";
import { loadProjectSecrets } from "../server/console-projects.js";

export const Route = createFileRoute("/orgs/$orgId/projects/$projectId/secrets")({
  loader: async ({ params, location }) => {
    const matrix = requireConsoleRead(
      await loadProjectSecrets({
        data: { organizationId: params.orgId, projectId: params.projectId },
      }),
      location.href,
    );
    return { matrix };
  },
  component: ProjectSecretsPage,
  errorComponent: ConsoleFramedRouteError,
});

/**
 * Read-only secrets × environments matrix (INS-375, docs/web-console-ux.md §Project Secrets View).
 * Metadata only: presence, version, and last-set actor/time. Values never render.
 */
function ProjectSecretsPage() {
  const { matrix } = Route.useLoaderData();
  const { orgId, projectId } = Route.useParams();
  const { environments, rows } = matrix;

  if (environments.length === 0) {
    return (
      <CliInvitation
        title="No environments yet"
        command="insecur envs create"
        lead="The secrets matrix needs at least one environment column. Create the first environment
          for this project:"
        hint="Each column is one environment; protected environments are marked and require approval
          before secrets move."
      />
    );
  }

  if (rows.length === 0) {
    return (
      <CliInvitation
        title="No secrets yet"
        command={`insecur secrets set --org ${orgId} --project ${projectId}`}
        lead="This project's Secret Shape is empty. Write the first secret from the CLI or your CI
          pipeline:"
        hint="The console shows presence, version, and last-set metadata only. Secret values never
          appear in the browser."
      />
    );
  }

  return <SecretsMatrixTable environments={environments} rows={rows} />;
}
