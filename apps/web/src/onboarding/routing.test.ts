import { describe, expect, it } from "vitest";
import { decideOnboardingRoute, parseHandoffSearch, verifiedHandoffNames } from "./routing.js";

const workspace = {
  organizationId: `org_${"0".repeat(25)}1`,
  projectId: `prj_${"0".repeat(25)}2`,
  environmentId: `env_${"0".repeat(25)}3`,
};

const memberships = [
  { organizationId: workspace.organizationId, displayName: "Acme Corp" },
  { organizationId: `org_${"0".repeat(25)}9`, displayName: "Beta LLC" },
];

describe("parseHandoffSearch", () => {
  it("accepts a complete, format-valid ID triple", () => {
    expect(
      parseHandoffSearch({
        org: workspace.organizationId,
        project: workspace.projectId,
        env: workspace.environmentId,
      }),
    ).toEqual(workspace);
  });

  it.each([
    {},
    { org: workspace.organizationId },
    { org: workspace.organizationId, project: workspace.projectId },
    { org: "org_short", project: workspace.projectId, env: workspace.environmentId },
    { org: workspace.projectId, project: workspace.projectId, env: workspace.environmentId },
  ])("falls back to the plain wizard entry on %j", (search) => {
    expect(parseHandoffSearch(search)).toBeUndefined();
  });
});

describe("verifiedHandoffNames", () => {
  const projects = [
    { projectId: workspace.projectId, displayName: "Payments" },
    { projectId: `prj_${"0".repeat(25)}8`, displayName: "Other" },
  ];
  const environments = [{ environmentId: workspace.environmentId, displayName: "Development" }];

  it("returns membership-truth Display Names when both IDs verify", () => {
    expect(verifiedHandoffNames(projects, environments, workspace)).toEqual({
      projectName: "Payments",
      environmentName: "Development",
    });
  });

  it("refuses a project the member's reads do not contain", () => {
    expect(
      verifiedHandoffNames(projects, environments, {
        ...workspace,
        projectId: `prj_${"0".repeat(25)}7`,
      }),
    ).toBeNull();
  });

  it("refuses an environment outside the verified project", () => {
    expect(
      verifiedHandoffNames(projects, environments, {
        ...workspace,
        environmentId: `env_${"0".repeat(25)}7`,
      }),
    ).toBeNull();
  });
});

describe("decideOnboardingRoute", () => {
  it("routes an org-less member into the wizard", () => {
    expect(decideOnboardingRoute([], undefined)).toEqual({ kind: "wizard" });
  });

  it("keeps the wizard for an org-less member even with handoff params", () => {
    expect(decideOnboardingRoute([], workspace)).toEqual({ kind: "wizard" });
  });

  it("reopens the CLI handoff for a workspace the member belongs to", () => {
    expect(decideOnboardingRoute(memberships, workspace)).toEqual({
      kind: "handoff",
      workspace,
      organizationName: "Acme Corp",
    });
  });

  it("sends members with an organization and no handoff back to their console", () => {
    expect(decideOnboardingRoute(memberships, undefined)).toEqual({
      kind: "redirect-console",
      href: `/orgs/${workspace.organizationId}`,
    });
  });

  it("refuses a handoff for an organization the member does not belong to", () => {
    const foreign = { ...workspace, organizationId: `org_${"0".repeat(25)}7` };
    expect(decideOnboardingRoute(memberships, foreign)).toEqual({
      kind: "redirect-console",
      href: `/orgs/${memberships[0]?.organizationId ?? ""}`,
    });
  });
});
