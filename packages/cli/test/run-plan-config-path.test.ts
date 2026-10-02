import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../src/api/types.js";
import type { GlobalCliFlags } from "../src/cli-options.js";
import { runRunPlanCommand } from "../src/commands/run-plan.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { clearMemorySession, setMemorySession } from "../src/session/memory-session.js";

const host = "https://insecur.test";
const orgId = "org_01TEST00000000000000000001";
const projectId = "prj_01TEST00000000000000000001";
const envId = "env_01TEST00000000000000000001";
const profileId = "prof_01TEST00000000000000000001";
const policyId = "rp_01TEST00000000000000000001";
const configDir = "/example/project";

const flags: GlobalCliFlags = {
  host,
  orgId: orgId as never,
  projectId: projectId as never,
  envId: envId as never,
  profile: undefined,
  profileId: undefined,
  configDir,
  agent: undefined,
  json: true,
  quiet: true,
  verbose: false,
  color: undefined,
  full: false,
};

const context: ResolvedCliContext = {
  projectConfig: {
    host,
    orgId: orgId as never,
    projectId: projectId as never,
    defaultEnvId: envId as never,
    profileId: profileId as never,
  },
  userConfig: {
    profiles: {
      [profileId]: {
        slug: "local-dev",
        displayName: "Local development" as never,
        host,
        orgId: orgId as never,
        projectId: projectId as never,
        envId: envId as never,
        defaultRunPolicyId: policyId as never,
      },
    },
  },
  scope: {
    host,
    orgId: orgId as never,
    projectId: projectId as never,
    envId: envId as never,
    profileId: profileId as never,
    profileSlug: "local-dev",
    profile: undefined,
  },
};

afterEach(() => {
  clearMemorySession();
  vi.restoreAllMocks();
});

describe("run plan project config location", () => {
  it.each([
    {
      mode: "variable_key",
      options: { variableKey: "API_KEY", command: ["node", "app.js"] },
      api: {
        listEnvironmentSecrets: async () => ({
          ok: true,
          envelope: { ok: true, data: { secrets: [] } },
        }),
      },
    },
    {
      mode: "profile_policy",
      options: { profileSelector: "local-dev", command: ["node", "app.js"] },
      api: {
        getRuntimeInjectionPolicy: async () => ({
          ok: true,
          envelope: { ok: true, data: { disabledAt: null, activeVersion: null } },
        }),
      },
    },
  ])("includes the discovered project config in $mode plans", async ({ mode, options, api }) => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2999-01-01T00:00:00.000Z",
    });
    let output = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });

    expect(await runRunPlanCommand(flags, api as unknown as ApiClient, context, options)).toBe(0);

    const parsed = JSON.parse(output) as {
      data: { projectConfigPath?: string; plan: { mode: string } };
    };
    expect(parsed.data.projectConfigPath).toBe(`${configDir}/.insecur.json`);
    expect(parsed.data.plan.mode).toBe(mode);
  });
});
