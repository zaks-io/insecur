import { ConsolePlaceholder } from "@insecur/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/orgs/$orgId/projects/$projectId/secrets")({
  component: ProjectSecretsPage,
});

/** Placeholder until the secrets matrix slice lands (docs/web-console-ux.md §Project Secrets View). */
function ProjectSecretsPage() {
  return (
    <div className="mt-8">
      <ConsolePlaceholder title="Secrets" className="max-w-2xl">
        The secrets matrix lands here: rows are secret names, columns are this project's
        environments, and cells carry presence, version, and last-set metadata. Values never render.
      </ConsolePlaceholder>
    </div>
  );
}
