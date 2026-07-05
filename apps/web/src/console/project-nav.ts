import type { ConsoleBreadcrumb } from "./sections.js";
import type { ConsoleOrganization } from "./organizations.js";
import type { ConsoleProject } from "./projects.js";

/**
 * The four project views (docs/web-console-ux.md §Navigation): Environments is the project index;
 * Secrets, Access, and Delivery are path segments under the project.
 */
export interface ProjectView {
  readonly segment: "" | "secrets" | "access" | "delivery";
  readonly label: string;
}

const ENVIRONMENTS_VIEW: ProjectView = { segment: "", label: "Environments" };

export const PROJECT_VIEWS: readonly ProjectView[] = [
  ENVIRONMENTS_VIEW,
  { segment: "secrets", label: "Secrets" },
  { segment: "access", label: "Access" },
  { segment: "delivery", label: "Delivery" },
];

function projectPath(organizationId: string, projectId: string): string {
  return `/orgs/${organizationId}/projects/${projectId}`;
}

/** `/orgs/:orgId/projects/:projectId[/segment]`, opaque IDs only (docs/web-console-ux.md §URLs). */
export function projectViewPath(
  organizationId: string,
  projectId: string,
  view: ProjectView,
): string {
  const base = projectPath(organizationId, projectId);
  return view.segment === "" ? base : `${base}/${view.segment}`;
}

/** The view a project pathname sits in; Environments for the index and unknown sub-paths. */
export function activeProjectView(
  pathname: string,
  organizationId: string,
  projectId: string,
): ProjectView {
  const prefix = projectPath(organizationId, projectId);
  const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";
  const segment = rest.split("/").find((piece) => piece !== "") ?? "";
  return PROJECT_VIEWS.find((view) => view.segment === segment) ?? ENVIRONMENTS_VIEW;
}

/**
 * Breadcrumb trail for a project page: Display Names in the trail, opaque IDs in the hrefs. The
 * project crumb is current on the Environments index; deeper views add their label as the current
 * crumb.
 */
export function projectBreadcrumbs(
  organization: ConsoleOrganization,
  project: ConsoleProject,
  view: ProjectView,
): readonly ConsoleBreadcrumb[] {
  const trail: ConsoleBreadcrumb[] = [
    { label: organization.displayName, href: `/orgs/${organization.organizationId}` },
    { label: "Projects", href: `/orgs/${organization.organizationId}/projects` },
  ];
  if (view.segment === "") {
    return [...trail, { label: project.displayName }];
  }
  return [
    ...trail,
    {
      label: project.displayName,
      href: projectPath(organization.organizationId, project.projectId),
    },
    { label: view.label },
  ];
}
