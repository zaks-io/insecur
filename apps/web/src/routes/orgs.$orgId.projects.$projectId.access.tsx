import { ConsolePlaceholder } from "@insecur/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/orgs/$orgId/projects/$projectId/access")({
  component: ProjectAccessPage,
});

/** Placeholder until the Access slice lands (docs/web-console-ux.md §Project Access Page). */
function ProjectAccessPage() {
  return (
    <div className="mt-8">
      <ConsolePlaceholder title="Access" className="max-w-2xl">
        Machine Identities, active and consumed grants, and agent-session attribution land here,
        with guided GitHub Actions OIDC setup.
      </ConsolePlaceholder>
    </div>
  );
}
