import { describe, expect, it } from "vitest";
import {
  activeProjectView,
  PROJECT_VIEWS,
  projectBreadcrumbs,
  projectViewPath,
} from "./project-nav.js";

const org = { organizationId: "org_01JZ8E2QYQAAAAAAAAAAAAAAAA", displayName: "Acme Corp" };
const project = {
  projectId: "prj_01JZ8EDQ2R7V0X3Z6C9D1F4G5H",
  displayName: "Payments API",
  createdAt: "2026-07-01T00:00:00.000Z",
};
const base = `/orgs/${org.organizationId}/projects/${project.projectId}`;

function view(segment: string) {
  const found = PROJECT_VIEWS.find((candidate) => candidate.segment === segment);
  if (found === undefined) {
    throw new Error(`unknown view segment: ${segment}`);
  }
  return found;
}

describe("projectViewPath", () => {
  it("keeps opaque IDs only in the URL; Environments is the project index", () => {
    expect(projectViewPath(org.organizationId, project.projectId, view(""))).toBe(base);
    expect(projectViewPath(org.organizationId, project.projectId, view("secrets"))).toBe(
      `${base}/secrets`,
    );
  });
});

describe("activeProjectView", () => {
  it("resolves the view from the pathname", () => {
    expect(activeProjectView(base, org.organizationId, project.projectId).label).toBe(
      "Environments",
    );
    expect(activeProjectView(`${base}/`, org.organizationId, project.projectId).label).toBe(
      "Environments",
    );
    expect(activeProjectView(`${base}/access`, org.organizationId, project.projectId).label).toBe(
      "Access",
    );
  });

  it("falls back to Environments for unknown sub-paths", () => {
    expect(activeProjectView(`${base}/nope`, org.organizationId, project.projectId).label).toBe(
      "Environments",
    );
  });
});

describe("projectBreadcrumbs", () => {
  it("renders Display Names over opaque-ID hrefs, ending at the project on the index", () => {
    const crumbs = projectBreadcrumbs(org, project, view(""));
    expect(crumbs).toEqual([
      { label: "Acme Corp", href: `/orgs/${org.organizationId}` },
      { label: "Projects", href: `/orgs/${org.organizationId}/projects` },
      { label: "Payments API" },
    ]);
  });

  it("links the project crumb and ends at the view label on deeper views", () => {
    const crumbs = projectBreadcrumbs(org, project, view("delivery"));
    expect(crumbs.at(-2)).toEqual({ label: "Payments API", href: base });
    expect(crumbs.at(-1)).toEqual({ label: "Delivery" });
  });
});
