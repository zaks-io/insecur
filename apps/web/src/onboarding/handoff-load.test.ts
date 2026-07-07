import { describe, expect, it, vi } from "vitest";
import { loadHandoffNames, resolveHandoffNamesLoad } from "./handoff-load.js";

const workspace = {
  organizationId: "org_01",
  projectId: "prj_01",
  environmentId: "env_01",
};

const projectsOk = {
  kind: "ok" as const,
  value: [{ projectId: "prj_01", displayName: "App", createdAt: "2026-01-01T00:00:00.000Z" }],
};

const environmentsOk = {
  kind: "ok" as const,
  value: [
    {
      environmentId: "env_01",
      displayName: "Development",
      lifecycleStage: "development" as const,
      isProtected: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

describe("resolveHandoffNamesLoad", () => {
  it("returns verified names when both reads succeed", () => {
    expect(resolveHandoffNamesLoad(projectsOk, environmentsOk, workspace)).toEqual({
      kind: "ok",
      names: { projectName: "App", environmentName: "Development" },
    });
  });

  it("preserves unavailable when either metadata read is an outage", () => {
    expect(resolveHandoffNamesLoad({ kind: "unavailable" }, environmentsOk, workspace)).toEqual({
      kind: "unavailable",
    });
    expect(resolveHandoffNamesLoad(projectsOk, { kind: "unavailable" }, workspace)).toEqual({
      kind: "unavailable",
    });
  });

  it("treats denied reads and unverifiable IDs as unverified", () => {
    expect(resolveHandoffNamesLoad({ kind: "denied" }, environmentsOk, workspace)).toEqual({
      kind: "unverified",
    });
    expect(resolveHandoffNamesLoad(projectsOk, { kind: "denied" }, workspace)).toEqual({
      kind: "unverified",
    });
    expect(
      resolveHandoffNamesLoad(
        {
          kind: "ok",
          value: [
            { projectId: "prj_other", displayName: "Other", createdAt: "2026-01-01T00:00:00.000Z" },
          ],
        },
        environmentsOk,
        workspace,
      ),
    ).toEqual({ kind: "unverified" });
  });
});

describe("loadHandoffNames", () => {
  it("preserves unavailable from a metadata loader outage", async () => {
    const loadOrgProjects = vi.fn().mockResolvedValue({ kind: "unavailable" });
    const loadProjectEnvironments = vi.fn().mockResolvedValue(environmentsOk);

    await expect(
      loadHandoffNames(workspace, { loadOrgProjects, loadProjectEnvironments }),
    ).resolves.toEqual({ kind: "unavailable" });
  });
});
