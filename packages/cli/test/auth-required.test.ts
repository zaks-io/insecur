import { describe, expect, it } from "vitest";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import { runInitCommand } from "../src/commands/init.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { clearMemorySession } from "../src/session/memory-session.js";
import type { ApiClient } from "../src/api/types.js";
import { CliError } from "../src/output/cli-error.js";
import { EXIT_AUTH_REQUIRED } from "../src/output/exit-codes.js";

const flags = {
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
};

const mockContext: ResolvedCliContext = {
  projectConfig: null,
  userConfig: { profiles: {} },
  scope: {
    host: flags.host,
    orgId: undefined,
    projectId: undefined,
    envId: undefined,
    profileId: undefined,
    profileSlug: undefined,
    profile: undefined,
  },
};

const noopApi: ApiClient = {
  createCliAuthorizationUrl: () => "https://insecur.test/v1/auth/cli/authorize",
  exchangeCliPkceSession: async () => {
    throw new Error("not used");
  },
  provisionPersonalOrganization: async () => {
    throw new Error("not used");
  },
  writeSecretByVariableKey: async () => {
    throw new Error("not used");
  },
  issueInjectionGrant: async () => {
    throw new Error("not used");
  },
  consumeInjectionGrant: async () => {
    throw new Error("not used");
  },
  consumeInjectionGrantAll: async () => {
    throw new Error("not used");
  },
  revokeCliSession: async () => {
    throw new Error("not used");
  },
  sessionWhoami: async () => {
    throw new Error("not used");
  },
};

describe("auth-required errors", () => {
  it("fails hosted init without a session credential with login remediation", async () => {
    clearMemorySession();
    delete process.env.INSECUR_SESSION_TOKEN;
    await expect(
      runInitCommand(flags, noopApi, mockContext, { profileSlug: "local-dev" }),
    ).rejects.toMatchObject({
      exitCode: EXIT_AUTH_REQUIRED,
      code: AUTH_ERROR_CODES.required,
      remediation: { login: ["insecur", "login"] },
    } satisfies Partial<CliError>);
  });
});
