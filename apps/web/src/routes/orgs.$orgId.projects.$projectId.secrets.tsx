import { createFileRoute } from "@tanstack/react-router";
import { ConsoleFramedRouteError } from "../components/console-route-error.js";
import { ProjectSecretsView } from "../components/secrets/project-secrets-view.js";
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

function ProjectSecretsPage() {
  const { matrix } = Route.useLoaderData();
  const { orgId, projectId } = Route.useParams();
  return <ProjectSecretsView matrix={matrix} orgId={orgId} projectId={projectId} />;
}
