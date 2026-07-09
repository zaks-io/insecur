import { environmentId } from "@insecur/domain";
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { attachGlobalOptions, globalFlags } from "../src/program-deps.js";
import { registerApprovalsCommands } from "../src/register-approvals-commands.js";

const runApprovalsListCommandMock = vi.hoisted(() => vi.fn(async () => 0));

vi.mock("../src/commands/approvals-list.js", () => ({
  runApprovalsListCommand: runApprovalsListCommandMock,
}));

const ENV_ID = environmentId.brand("env_00000000000000000000000001");

function makeContext(envId = ENV_ID): ResolvedCliContext {
  return {
    projectConfig: null,
    userConfig: { profiles: {} },
    scope: {
      host: "https://insecur.test",
      orgId: "org_00000000000000000000000001" as never,
      projectId: "prj_00000000000000000000000001" as never,
      envId,
      profileId: undefined,
      profileSlug: undefined,
      profile: undefined,
    },
  };
}

describe("registerApprovalsCommands", () => {
  it("accepts --env-id on approvals list after the subcommand", async () => {
    runApprovalsListCommandMock.mockClear();
    const program = attachGlobalOptions(new Command());
    const resolveApi = vi.fn(async () => ({ api: {} as never, context: makeContext() }));
    registerApprovalsCommands(program, { globalFlags, resolveApi });

    await program.parseAsync([
      "node",
      "insecur",
      "--host",
      "https://insecur.test",
      "--json",
      "approvals",
      "list",
      "--env-id",
      ENV_ID,
    ]);

    expect(resolveApi).toHaveBeenCalledWith(
      expect.objectContaining({
        envId: ENV_ID,
        host: "https://insecur.test",
        json: true,
      }),
    );
    expect(runApprovalsListCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({ envId: ENV_ID, host: "https://insecur.test", json: true }),
      expect.anything(),
      expect.anything(),
      { envId: ENV_ID },
    );
  });

  it("falls back to the resolved environment when --env-id is omitted", async () => {
    runApprovalsListCommandMock.mockClear();
    const program = attachGlobalOptions(new Command());
    registerApprovalsCommands(program, {
      globalFlags,
      resolveApi: async () => ({ api: {} as never, context: makeContext() }),
    });

    await program.parseAsync(["node", "insecur", "approvals", "list"]);

    expect(runApprovalsListCommandMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      { envId: ENV_ID },
    );
  });
});
