import { describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { registerRunCommand } from "../src/register-run-command.js";

const runRunCommandMock = vi.hoisted(() => vi.fn(async () => 0));

vi.mock("../src/commands/run.js", () => ({
  runRunCommand: runRunCommandMock,
}));

describe("registerRunCommand", () => {
  it("forwards commander positional profile separately from child argv", async () => {
    runRunCommandMock.mockClear();
    const program = new Command();
    registerRunCommand(program, {
      globalFlags: () => ({
        host: "https://insecur.test",
        orgId: undefined,
        projectId: undefined,
        envId: undefined,
        profile: undefined,
        profileId: undefined,
        configDir: undefined,
        json: true,
        quiet: true,
        verbose: false,
      }),
      resolveApi: async () => ({
        api: {} as never,
        context: {
          projectConfig: null,
          userConfig: { profiles: {} },
          scope: {
            host: "https://insecur.test",
            orgId: undefined,
            projectId: undefined,
            envId: undefined,
            profileId: undefined,
            profileSlug: undefined,
            profile: undefined,
          },
        },
      }),
    });

    await program.parseAsync(["node", "insecur", "run", "local-dev", "npm", "test"]);

    expect(runRunCommandMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        profileSelector: "local-dev",
        command: ["npm", "test"],
      }),
    );
  });
});
