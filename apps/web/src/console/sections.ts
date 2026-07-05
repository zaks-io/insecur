/**
 * The five org-scoped console sections (docs/web-console-ux.md §Navigation). `segment` is the
 * URL path piece after `/orgs/:orgId`; Home is the org index.
 */
export interface ConsoleSection {
  readonly segment: "" | "projects" | "audit" | "people" | "settings";
  readonly label: string;
}

const HOME_SECTION: ConsoleSection = { segment: "", label: "Home" };

export const CONSOLE_SECTIONS: readonly ConsoleSection[] = [
  HOME_SECTION,
  { segment: "projects", label: "Projects" },
  { segment: "audit", label: "Audit" },
  { segment: "people", label: "People" },
  { segment: "settings", label: "Settings" },
];

/** `/orgs/:orgId[/segment]` with opaque IDs only in the URL (docs/web-console-ux.md §URLs). */
export function consoleSectionPath(organizationId: string, section: ConsoleSection): string {
  return section.segment === ""
    ? `/orgs/${organizationId}`
    : `/orgs/${organizationId}/${section.segment}`;
}

/** The section a console pathname sits in; Home for the org index and unknown sub-paths. */
export function activeConsoleSection(pathname: string, organizationId: string): ConsoleSection {
  const prefix = `/orgs/${organizationId}`;
  const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";
  const segment = rest.split("/").find((piece) => piece !== "") ?? "";
  return CONSOLE_SECTIONS.find((section) => section.segment === segment) ?? HOME_SECTION;
}

export interface ConsoleBreadcrumb {
  readonly label: string;
  /** Absent on the current page's crumb. */
  readonly href?: string;
}

/**
 * Breadcrumb trail for a console page: Display Names in the trail, opaque IDs in the hrefs
 * (docs/web-console-ux.md §URLs). Home is the org crumb itself.
 */
export function consoleBreadcrumbs(
  organization: { readonly organizationId: string; readonly displayName: string },
  section: ConsoleSection,
): readonly ConsoleBreadcrumb[] {
  if (section.segment === "") {
    return [{ label: organization.displayName }];
  }
  return [
    { label: organization.displayName, href: `/orgs/${organization.organizationId}` },
    { label: section.label },
  ];
}
