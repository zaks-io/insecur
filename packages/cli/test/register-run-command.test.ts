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

  it("parses the wizard's profile-less CLI handoff run command as pasted (INS-374)", async () => {
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

    await program.parseAsync([
      "node",
      "insecur",
      "run",
      "--variable-key",
      "APP_SECRET",
      "--",
      "printenv",
      "APP_SECRET",
    ]);

    expect(runRunCommandMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      {
        variableKey: "APP_SECRET",
        command: ["printenv", "APP_SECRET"],
      },
    );
  });

  it("keeps a typo'd explicit profile in --variable-key mode instead of exec'ing it (INS-374 review)", async () => {
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

    await program.parseAsync([
      "node",
      "insecur",
      "run",
      "staging-typo",
      "--variable-key",
      "APP_SECRET",
      "--",
      "npm",
      "test",
    ]);

    // The selector survives so runRunCommand raises the loud mode-exclusivity error.
    expect(runRunCommandMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      {
        variableKey: "APP_SECRET",
        profileSelector: "staging-typo",
        command: ["npm", "test"],
      },
    );
  });
});
