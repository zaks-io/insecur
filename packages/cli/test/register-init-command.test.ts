import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GlobalCliFlags } from "../src/cli-options.js";
import type { ProgramDeps } from "../src/program-deps.js";

const runInitCommand = vi.hoisted(() => vi.fn(async () => 0));

vi.mock("../src/commands/init.js", () => ({
  runInitCommand,
  DEFAULT_INIT_PROFILE_SLUG: "local-dev",
}));

import { registerInitCommand } from "../src/register-init-command.js";

const baseFlags = {
  host: undefined,
  orgId: undefined,
  projectId: undefined,
  envId: undefined,
  profile: undefined,
  profileId: undefined,
  configDir: undefined,
  agent: undefined,
  json: true,
  quiet: false,
  verbose: false,
  color: undefined,
  full: false,
} satisfies GlobalCliFlags;

afterEach(() => {
  vi.restoreAllMocks();
  runInitCommand.mockClear();
  process.exitCode = 0;
});

describe("registerInitCommand", () => {
  it.each([
    { configured: undefined, expected: "/example/new-project" },
    { configured: "/example/explicit", expected: "/example/explicit" },
  ])("pins configDir before resolving context: $expected", async ({ configured, expected }) => {
    vi.spyOn(process, "cwd").mockReturnValue("/example/new-project");
    const flags = { ...baseFlags, configDir: configured };
    const resolveApi = vi.fn(async () => ({
      api: {} as never,
      context: {} as never,
    }));
    const deps = {
      globalFlags: () => flags,
      resolveApi,
      createHostedApi: () => ({}) as never,
    } satisfies ProgramDeps;
    const program = new Command();
    registerInitCommand(program, deps);

    await program.parseAsync(["node", "insecur", "init"]);

    expect(resolveApi).toHaveBeenCalledWith(expect.objectContaining({ configDir: expected }));
    expect(runInitCommand).toHaveBeenCalledWith(
      expect.objectContaining({ configDir: expected }),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ profileSlug: "local-dev" }),
    );
    expect(flags.configDir).toBe(configured);
  });
});
