import { createFileRoute } from "@tanstack/react-router";
import { ProjectAccessContent } from "../components/access/project-access-content.js";
import { ConsoleFramedRouteError } from "../components/console-route-error.js";
import { requireConsoleRead } from "../console/route-guards.js";
import { loadProjectAccess } from "../server/console-project-access.js";

export const Route = createFileRoute("/orgs/$orgId/projects/$projectId/access")({
  loader: async ({ params, location }) => {
    const access = requireConsoleRead(
      await loadProjectAccess({
        data: { organizationId: params.orgId, projectId: params.projectId },
      }),
      location.href,
    );
    return { access };
  },
  component: ProjectAccessPage,
  errorComponent: ConsoleFramedRouteError,
});

/**
 * Read-rich project Access view (INS-382, docs/web-console-ux.md §Project Access Page).
 * Machine identities, active/consumed grants, and agent-session attribution — metadata only.
 */
function ProjectAccessPage() {
  const { access } = Route.useLoaderData();

  return (
    <ProjectAccessContent machineIdentities={access.machineIdentities} grants={access.grants} />
  );
}
