import { describe, expect, it } from "vitest";
import { LOCAL_ERROR_CODES } from "@insecur/domain";
import { runOrgsListCommand } from "../src/commands/orgs-list.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { CliError } from "../src/output/cli-error.js";
import { EXIT_FORBIDDEN } from "../src/output/exit-codes.js";

const flags = {
  host: undefined,
  orgId: undefined,
  projectId: undefined,
  envId: undefined,
  profile: undefined,
  profileId: undefined,
  configDir: undefined,
  json: true,
  quiet: true,
  verbose: false,
};

const localContext: ResolvedCliContext = {
  projectConfig: null,
  userConfig: { profiles: {} },
  scope: {
    host: "local",
    orgId: undefined,
    projectId: "prj_01TEST00000000000000000001" as never,
    envId: "env_01TEST00000000000000000001" as never,
    profileId: undefined,
    profileSlug: undefined,
    profile: undefined,
  },
};

describe("local cloud feature guard", () => {
  it("rejects hosted-only commands with remediation argv arrays", async () => {
    await expect(runOrgsListCommand(flags, {} as never, localContext)).rejects.toMatchObject({
      exitCode: EXIT_FORBIDDEN,
      code: LOCAL_ERROR_CODES.cloudFeatureUnavailable,
      remediation: {
        login: ["insecur", "login"],
        migrate: ["insecur", "projects", "migrate", "--confirm-migrate"],
        hosted: ["insecur", "orgs", "list"],
      },
    } satisfies Partial<CliError>);
  });
});
