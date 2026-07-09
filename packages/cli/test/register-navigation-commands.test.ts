import { environmentId, projectId } from "@insecur/domain";
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { attachGlobalOptions, globalFlags } from "../src/program-deps.js";
import { registerEnvsCommands } from "../src/register-envs-commands.js";
import { registerProjectsCommands } from "../src/register-orgs-projects-commands.js";

const runProjectsCreateCommandMock = vi.hoisted(() => vi.fn(async () => 0));
const runProjectsListCommandMock = vi.hoisted(() => vi.fn(async () => 0));
const runOrgsListCommandMock = vi.hoisted(() => vi.fn(async () => 0));
const runEnvsCreateCommandMock = vi.hoisted(() => vi.fn(async () => 0));
const runEnvsListCommandMock = vi.hoisted(() => vi.fn(async () => 0));

vi.mock("../src/commands/projects-create.js", () => ({
  runProjectsCreateCommand: runProjectsCreateCommandMock,
}));

vi.mock("../src/commands/projects-list.js", () => ({
  runProjectsListCommand: runProjectsListCommandMock,
}));

vi.mock("../src/commands/orgs-list.js", () => ({
  runOrgsListCommand: runOrgsListCommandMock,
}));

vi.mock("../src/commands/envs-create.js", () => ({
  runEnvsCreateCommand: runEnvsCreateCommandMock,
}));

vi.mock("../src/commands/envs-list.js", () => ({
  runEnvsListCommand: runEnvsListCommandMock,
}));

const PROJECT_ID = projectId.brand("prj_00000000000000000000000001");
const ENV_ID = environmentId.brand("env_00000000000000000000000001");
const SOURCE_ENV_ID = environmentId.brand("env_00000000000000000000000002");

function makeContext(): ResolvedCliContext {
  return {
    projectConfig: null,
    userConfig: { profiles: {} },
    scope: {
      host: "https://insecur.test",
      orgId: "org_00000000000000000000000001" as never,
      projectId: PROJECT_ID,
      envId: ENV_ID,
      profileId: undefined,
      profileSlug: undefined,
      profile: undefined,
    },
  };
}

describe("navigation command registration", () => {
  it("accepts --project-id after projects create despite the global --project-id option", async () => {
    runProjectsCreateCommandMock.mockClear();
    const program = attachGlobalOptions(new Command());
    const resolveApi = vi.fn(async () => ({ api: {} as never, context: makeContext() }));
    registerProjectsCommands(program, { globalFlags, resolveApi });

    await program.parseAsync([
      "node",
      "insecur",
      "--host",
      "https://insecur.test",
      "--json",
      "projects",
      "create",
      "--project-id",
      PROJECT_ID,
      "--display-name-stdin",
    ]);

    expect(runProjectsCreateCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "https://insecur.test", json: true }),
      expect.anything(),
      expect.anything(),
      { projectId: PROJECT_ID, displayNameStdin: true },
    );
  });

  it("accepts --env-id after envs create despite the global --env-id option", async () => {
    runEnvsCreateCommandMock.mockClear();
    const program = attachGlobalOptions(new Command());
    const resolveApi = vi.fn(async () => ({ api: {} as never, context: makeContext() }));
    registerEnvsCommands(program, { globalFlags, resolveApi });

    await program.parseAsync([
      "node",
      "insecur",
      "--host",
      "https://insecur.test",
      "--json",
      "envs",
      "create",
      "--env-id",
      ENV_ID,
      "--display-name-stdin",
      "--copy-shapes-from-env-id",
      SOURCE_ENV_ID,
    ]);

    expect(runEnvsCreateCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "https://insecur.test", json: true }),
      expect.anything(),
      expect.anything(),
      {
        envId: ENV_ID,
        displayNameStdin: true,
        copyShapesFromEnvId: SOURCE_ENV_ID,
      },
    );
  });
});
