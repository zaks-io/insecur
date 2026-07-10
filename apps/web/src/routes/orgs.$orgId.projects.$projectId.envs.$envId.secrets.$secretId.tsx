import { createFileRoute } from "@tanstack/react-router";
import { ConsoleFramedRouteError } from "../components/console-route-error.js";
import {
  SecretDetailBreadcrumbs,
  SecretVersionHistoryTable,
} from "../components/secrets/secret-version-history.js";
import { requireConsoleRead } from "../console/route-guards.js";
import { findConsoleEnvironment } from "../console/projects.js";
import { loadProjectEnvironments, loadSecretVersions } from "../server/console-projects.js";

export const Route = createFileRoute(
  "/orgs/$orgId/projects/$projectId/envs/$envId/secrets/$secretId",
)({
  loader: async ({ params, location }) => {
    const [versionsRead, environmentsRead] = await Promise.all([
      loadSecretVersions({
        data: {
          organizationId: params.orgId,
          projectId: params.projectId,
          environmentId: params.envId,
          secretId: params.secretId,
        },
      }),
      loadProjectEnvironments({
        data: { organizationId: params.orgId, projectId: params.projectId },
      }),
    ]);
    const versions = requireConsoleRead(versionsRead, location.href);
    const environments = requireConsoleRead(environmentsRead, location.href);
    const environment = findConsoleEnvironment(environments, params.envId);
    return { versions, environment };
  },
  component: SecretInEnvironmentDetailPage,
  errorComponent: ConsoleFramedRouteError,
});

/**
 * Secret-in-environment detail (INS-380, docs/web-console-ux.md §Project Secrets View). Metadata
 * only: version history with principal-chain actor rendering. Secret values never render.
 */
function SecretInEnvironmentDetailPage() {
  const { versions, environment } = Route.useLoaderData();
  const { orgId, projectId } = Route.useParams();
  const environmentLabel = environment?.displayName ?? "Environment";

  return (
    <div>
      <SecretDetailBreadcrumbs
        orgId={orgId}
        projectId={projectId}
        environmentLabel={environmentLabel}
        variableKey={versions.variableKey}
      />
      <header className="mt-6">
        <h1 className="text-3xl font-semibold tracking-tight leading-tight">
          {versions.variableKey}
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Version history for this secret in {environmentLabel}. Metadata only — secret values never
          appear in the console.
        </p>
      </header>
      {versions.versions.length === 0 ? (
        <p className="mt-6 font-mono text-sm text-muted-foreground">No versions recorded yet.</p>
      ) : (
        <SecretVersionHistoryTable versions={versions.versions} />
      )}
    </div>
  );
}
