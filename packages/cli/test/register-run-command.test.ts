import { describe, expect, it, vi } from "vitest";
import { Command, type Command as CommanderCommand } from "commander";
import { registerRunCommand } from "../src/register-run-command.js";
import { registerScanCommand } from "../src/register-scan-command.js";

function captureCommandHelp(command: CommanderCommand): string {
  let output = "";
  command.configureOutput({
    writeOut: (text) => {
      output += text;
    },
    writeErr: (text) => {
      output += text;
    },
  });
  command.outputHelp({ error: false });
  return output;
}

const runRunCommandMock = vi.hoisted(() => vi.fn(async () => 0));

vi.mock("../src/commands/run.js", () => ({
  runRunCommand: runRunCommandMock,
}));

describe("registerRunCommand", () => {
  it("documents the -- separator in help output", () => {
    const program = new Command();
    registerRunCommand(program, {
      globalFlags: () => ({
        host: undefined,
        orgId: undefined,
        projectId: undefined,
        envId: undefined,
        profile: undefined,
        profileId: undefined,
        configDir: undefined,
        json: false,
        quiet: false,
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

    const run = program.commands.find((command) => command.name() === "run");
    if (run === undefined) {
      throw new Error("expected run command to be registered");
    }
    const help = captureCommandHelp(run);
    expect(help).toContain("insecur run [profile] -- <command...>");
    expect(help).toContain("The `--` separator is required");
  });

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

describe("registerScanCommand", () => {
  it("documents --config-dir scan root behavior in help output", () => {
    const program = new Command();
    registerScanCommand(program, {
      globalFlags: () => ({
        host: undefined,
        orgId: undefined,
        projectId: undefined,
        envId: undefined,
        profile: undefined,
        profileId: undefined,
        configDir: undefined,
        json: false,
        quiet: false,
        verbose: false,
      }),
    });

    const scan = program.commands.find((command) => command.name() === "scan");
    if (scan === undefined) {
      throw new Error("expected scan command to be registered");
    }
    const help = captureCommandHelp(scan);
    expect(help).toContain("The global --config-dir flag sets the project scan root");
    expect(help).toContain("--agent-transcripts");
    expect(help).toContain("--agent-projects");
  });
});
