import { createFileRoute, Link } from "@tanstack/react-router";
import { ConsoleFramedRouteError } from "../components/console-route-error.js";
import { shortDate, type ConsoleProject } from "../console/projects.js";
import { requireConsoleRead } from "../console/route-guards.js";
import { CliInvitation } from "../components/cli-invitation.js";
import { loadOrgProjects } from "../server/console-projects.js";

export const Route = createFileRoute("/orgs/$orgId/projects/")({
  loader: async ({ params, location }) => {
    const projects = requireConsoleRead(
      await loadOrgProjects({ data: { organizationId: params.orgId } }),
      location.href,
    );
    return { projects };
  },
  component: ProjectsIndexPage,
  errorComponent: ConsoleFramedRouteError,
});

function ProjectRegister({
  orgId,
  projects,
}: {
  orgId: string;
  projects: readonly ConsoleProject[];
}) {
  return (
    <ul className="mt-8 border-2 border-ink">
      {projects.map((project, index) => (
        <li key={project.projectId} className={index > 0 ? "border-t-2 border-ink" : undefined}>
          <Link
            to="/orgs/$orgId/projects/$projectId"
            params={{ orgId, projectId: project.projectId }}
            className="group flex items-baseline justify-between gap-4 px-5 py-4 no-underline transition-colors hover:bg-ink/10 sm:px-6"
          >
            <span className="min-w-0">
              <span className="block truncate font-display text-lg leading-snug text-foreground">
                {project.displayName}
              </span>
              <span className="mt-1 block font-mono text-xs text-muted-foreground">
                {project.projectId}
              </span>
            </span>
            <span className="flex shrink-0 items-baseline gap-4 font-mono text-xs text-muted-foreground">
              <span className="hidden sm:inline">created {shortDate(project.createdAt)}</span>
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                {"→"}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ProjectsIndexPage() {
  const { projects } = Route.useLoaderData();
  const { orgId } = Route.useParams();

  return (
    <section className="px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex items-end justify-between gap-4 border-b-2 border-ink pb-6">
        <h1 className="font-display text-3xl leading-tight sm:text-4xl">Projects</h1>
        <p className="font-mono text-xs text-muted-foreground">
          {projects.length === 1 ? "1 project" : `${String(projects.length)} projects`}
        </p>
      </header>
      {projects.length === 0 ? (
        <CliInvitation
          title="No projects yet"
          command="insecur init"
          lead="A project scopes secrets and environments to one codebase. Create the first one from
            the repo you want to protect:"
          hint="This registers the project in this organization and creates its dev environment
            in one step."
        />
      ) : (
        <ProjectRegister orgId={orgId} projects={projects} />
      )}
    </section>
  );
}
