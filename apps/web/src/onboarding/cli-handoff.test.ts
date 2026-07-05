import { describe, expect, it } from "vitest";
import { cliHandoffCommands, workspaceReceiptRows } from "./cli-handoff.js";

const workspace = {
  organizationId: `org_${"0".repeat(25)}1`,
  projectId: `prj_${"0".repeat(25)}2`,
  environmentId: `env_${"0".repeat(25)}3`,
};

describe("cliHandoffCommands", () => {
  it("pre-fills every scoped command with the real opaque IDs from provisioning", () => {
    const commands = cliHandoffCommands(workspace);
    const scoped = commands.filter((entry) => entry.command.includes("--org-id"));
    expect(scoped.map((entry) => entry.id)).toEqual(["first-secret", "first-run"]);
    for (const entry of scoped) {
      expect(entry.command).toContain(`--org-id ${workspace.organizationId}`);
      expect(entry.command).toContain(`--project-id ${workspace.projectId}`);
      expect(entry.command).toContain(`--env-id ${workspace.environmentId}`);
    }
  });

  it("walks the documented product flow: shell login, blind write, injected run", () => {
    const commands = cliHandoffCommands(workspace);
    expect(commands.map((entry) => entry.id)).toEqual(["login", "first-secret", "first-run"]);
    expect(commands[0]?.command).toBe("insecur login --shell");
    expect(commands[1]?.command).toContain("secrets set");
    expect(commands[1]?.command).toContain("--generate random");
    expect(commands[2]?.command).toContain("insecur run");
  });

  it("keeps commands single-line so copy output runs as pasted", () => {
    for (const entry of cliHandoffCommands(workspace)) {
      expect(entry.command).not.toMatch(/[\n\r]/u);
    }
  });
});

describe("workspaceReceiptRows", () => {
  it("carries the three provisioned resources with Display Names when known", () => {
    const rows = workspaceReceiptRows(workspace, {
      organizationName: "Acme Corp",
      projectName: "Payments",
    });
    expect(rows).toEqual([
      { label: "Organization", displayName: "Acme Corp", id: workspace.organizationId },
      { label: "Project", displayName: "Payments", id: workspace.projectId },
      { label: "Environment", displayName: "Development", id: workspace.environmentId },
    ]);
  });

  it("keeps the IDs and drops unknown names on a reloaded handoff", () => {
    const rows = workspaceReceiptRows(workspace, { organizationName: "Acme Corp" });
    expect(rows[1]).toEqual({ label: "Project", id: workspace.projectId });
    expect(rows.map((row) => row.id)).toEqual([
      workspace.organizationId,
      workspace.projectId,
      workspace.environmentId,
    ]);
  });
});
