import { Button, ConsoleNav, ConsoleNavItem } from "@insecur/ui";
import { createFileRoute, Link, notFound, Outlet, useLocation } from "@tanstack/react-router";
import { ConsoleFramedRouteError } from "../components/console-route-error.js";
import { activeProjectView, PROJECT_VIEWS, projectViewPath } from "../console/project-nav.js";
import { findConsoleProject, shortDate } from "../console/projects.js";
import { requireConsoleRead } from "../console/route-guards.js";
import { loadOrgProjects } from "../server/console-projects.js";

export const Route = createFileRoute("/orgs/$orgId/projects/$projectId")({
  // One projects read per project entry; view switches inside the sub-nav reuse it briefly.
  staleTime: 30_000,
  loader: async ({ params, location }) => {
    const projects = requireConsoleRead(
      await loadOrgProjects({ data: { organizationId: params.orgId } }),
      location.href,
    );
    // Metadata-safe denial: a project outside the member's org reads as nonexistent.
    const project = findConsoleProject(projects, params.projectId);
    if (project === undefined) {
      throw notFound();
    }
    return { project };
  },
  component: ProjectLayout,
  notFoundComponent: ProjectNotFound,
  errorComponent: ConsoleFramedRouteError,
});

function ProjectViewTabs({ orgId, projectId }: { orgId: string; projectId: string }) {
  const { pathname } = useLocation();
  const active = activeProjectView(pathname, orgId, projectId);
  return (
    <ConsoleNav
      orientation="horizontal"
      aria-label="Project views"
      className="mt-8 border-b-2 border-ink"
    >
      {PROJECT_VIEWS.map((view) => (
        <ConsoleNavItem key={view.label} asChild active={view.segment === active.segment}>
          <Link to={projectViewPath(orgId, projectId, view)}>{view.label}</Link>
        </ConsoleNavItem>
      ))}
    </ConsoleNav>
  );
}

function ProjectLayout() {
  const { project } = Route.useLoaderData();
  const { orgId, projectId } = Route.useParams();

  return (
    <section className="px-5 py-8 sm:px-8 sm:py-10">
      <header className="border-b-2 border-ink pb-6">
        <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Project
        </p>
        <h1 className="mt-1 font-display text-3xl leading-tight sm:text-4xl">
          {project.displayName}
        </h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {project.projectId} · created {shortDate(project.createdAt)}
        </p>
      </header>
      <ProjectViewTabs orgId={orgId} projectId={projectId} />
      <Outlet />
    </section>
  );
}

/** Rendered inside the console frame: the member is authed and the org is real. */
function ProjectNotFound() {
  const { orgId } = Route.useParams();
  return (
    <section className="px-5 py-10 sm:px-8 sm:py-12">
      <div className="max-w-xl border-2 border-ink px-6 py-6">
        <p className="font-mono text-xs text-muted-foreground">404</p>
        <h1 className="mt-1 font-display text-2xl leading-tight">Not found</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          This project doesn't exist or you don't have access to it.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-5">
          <Link to="/orgs/$orgId/projects" params={{ orgId }}>
            Back to projects
          </Link>
        </Button>
      </div>
    </section>
  );
}
