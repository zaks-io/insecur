import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import {
  assertRunModeExclusive,
  reconcileProfileRunCommand,
  resolveProfileRunInput,
  resolveProfileRunLookup,
  resolveScopeBoundProfileId,
} from "../src/commands/resolve-run-profile.js";
import type { GlobalCliFlags } from "../src/cli-options.js";
import { loadAndResolveCliContext } from "../src/config/load-cli-context.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { PROJECT_CONFIG_FILE, USER_CONFIG_FILE } from "../src/config/paths.js";
import { createIsolatedHome } from "./helpers/isolated-home.js";

const ORG_ID = "org_01TEST00000000000000000001";
const PROJECT_ID = "prj_01TEST00000000000000000001";
const ENV_ID = "env_01TEST00000000000000000001";
const PROFILE_ID = "prof_01TEST00000000000000000001";
const OTHER_PROFILE_ID = "prof_01TEST00000000000000000002";
const POLICY_ID = "rp_01TEST00000000000000000001";

const flags: GlobalCliFlags = {
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

const userConfig: ResolvedCliContext["userConfig"] = {
  profiles: {
    [PROFILE_ID]: {
      slug: "local-dev",
      displayName: "Local development" as never,
      host: flags.host ?? "https://insecur.test",
      orgId: ORG_ID as never,
      projectId: PROJECT_ID as never,
      envId: ENV_ID as never,
      defaultRunPolicyId: POLICY_ID as never,
    },
    [OTHER_PROFILE_ID]: {
      slug: "staging",
      displayName: "Staging" as never,
      host: flags.host ?? "https://insecur.test",
      orgId: ORG_ID as never,
      projectId: PROJECT_ID as never,
      envId: ENV_ID as never,
      defaultRunPolicyId: POLICY_ID as never,
    },
  },
};

function createContext(overrides: {
  readonly scope?: Partial<ResolvedCliContext["scope"]>;
  readonly projectConfig?: ResolvedCliContext["projectConfig"];
}): ResolvedCliContext {
  return {
    projectConfig: overrides.projectConfig ?? null,
    userConfig,
    scope: {
      host: flags.host ?? "https://insecur.test",
      orgId: ORG_ID as never,
      projectId: PROJECT_ID as never,
      envId: ENV_ID as never,
      profileId: undefined,
      profileSlug: undefined,
      profile: undefined,
      ...overrides.scope,
    },
  };
}

describe("resolveProfileRunLookup project profile selection", () => {
  it("uses scope.profileId from project .insecur.json before ambient profile slug", () => {
    expect(
      resolveProfileRunLookup({
        flags,
        context: createContext({
          scope: {
            profileId: PROFILE_ID as never,
            profileSlug: "staging",
          },
        }),
      }),
    ).toEqual({ profileId: PROFILE_ID });
  });

  it("falls back to projectConfig.profileId when scope.profileId is unset", () => {
    expect(
      resolveProfileRunLookup({
        flags,
        context: createContext({
          projectConfig: {
            host: flags.host ?? "https://insecur.test",
            orgId: ORG_ID as never,
            projectId: PROJECT_ID as never,
            defaultEnvId: ENV_ID as never,
            profileId: PROFILE_ID as never,
          },
        }),
      }),
    ).toEqual({ profileId: PROFILE_ID });
  });

  it("exposes the same project-bound id from scope and project config helpers", () => {
    const context = createContext({
      projectConfig: {
        host: flags.host ?? "https://insecur.test",
        orgId: ORG_ID as never,
        projectId: PROJECT_ID as never,
        defaultEnvId: ENV_ID as never,
        profileId: PROFILE_ID as never,
      },
      scope: {
        profileId: PROFILE_ID as never,
      },
    });
    expect(resolveScopeBoundProfileId(context)).toBe(PROFILE_ID);
  });
});

describe("reconcileProfileRunCommand project profile selection", () => {
  it("treats an unknown commander positional as the child executable when scope.profileId is set", () => {
    expect(
      reconcileProfileRunCommand({
        flags,
        context: createContext({
          scope: {
            profileId: PROFILE_ID as never,
          },
        }),
        positionalProfile: "node",
        args: ["node", "-e", "process.exit(0)"],
      }),
    ).toEqual({
      command: ["node", "-e", "process.exit(0)"],
    });
  });

  it("keeps a valid commander positional profile when scope.profileId is also set", () => {
    expect(
      reconcileProfileRunCommand({
        flags,
        context: createContext({
          scope: {
            profileId: PROFILE_ID as never,
          },
        }),
        positionalProfile: "staging",
        args: ["npm", "test"],
      }),
    ).toEqual({
      profileSelector: "staging",
      command: ["npm", "test"],
    });
  });

  it("treats an unknown commander positional as the child executable in --variable-key mode with no profiles at all", () => {
    // The wizard's CLI handoff (INS-374): fresh user, no config, no ambient profile.
    expect(
      reconcileProfileRunCommand({
        flags,
        context: {
          projectConfig: null,
          userConfig: { profiles: {} },
          scope: createContext({}).scope,
        },
        variableKey: "APP_SECRET",
        positionalProfile: "printenv",
        args: ["printenv", "APP_SECRET"],
      }),
    ).toEqual({
      command: ["printenv", "APP_SECRET"],
    });
  });

  it("keeps a resolvable positional profile in --variable-key mode so mode exclusivity still errors", () => {
    expect(
      reconcileProfileRunCommand({
        flags,
        context: createContext({}),
        variableKey: "APP_SECRET",
        positionalProfile: "staging",
        args: ["staging", "npm", "test"],
      }),
    ).toEqual({
      profileSelector: "staging",
      command: ["npm", "test"],
    });
  });

  it("keeps an unresolvable positional when neither --variable-key nor an ambient profile selects a mode", () => {
    expect(
      reconcileProfileRunCommand({
        flags,
        context: {
          projectConfig: null,
          userConfig: { profiles: {} },
          scope: createContext({}).scope,
        },
        positionalProfile: "typo-profile",
        args: ["typo-profile", "npm", "start"],
      }),
    ).toEqual({
      profileSelector: "typo-profile",
      command: ["npm", "start"],
    });
  });
});

describe("resolveProfileRunInput project profile selection", () => {
  it("resolves the profile from project .insecur.json profileId when scope only carries the id", () => {
    const resolved = resolveProfileRunInput({
      flags,
      context: createContext({
        projectConfig: {
          host: flags.host ?? "https://insecur.test",
          orgId: ORG_ID as never,
          projectId: PROJECT_ID as never,
          defaultEnvId: ENV_ID as never,
          profileId: PROFILE_ID as never,
        },
        scope: {
          profileId: PROFILE_ID as never,
        },
      }),
    });

    expect(resolved.profileId).toBe(PROFILE_ID);
    expect(resolved.profileSlug).toBe("local-dev");
    expect(resolved.policyId).toBe(POLICY_ID);
  });

  it("resolves the profile from projectConfig.profileId when scope.profileId is unset", () => {
    const resolved = resolveProfileRunInput({
      flags,
      context: createContext({
        projectConfig: {
          host: flags.host ?? "https://insecur.test",
          orgId: ORG_ID as never,
          projectId: PROJECT_ID as never,
          defaultEnvId: ENV_ID as never,
          profileId: PROFILE_ID as never,
        },
      }),
    });

    expect(resolved.profileId).toBe(PROFILE_ID);
    expect(resolved.profileSlug).toBe("local-dev");
  });

  it("prefers scope.profileId over a conflicting ambient profile slug", () => {
    const resolved = resolveProfileRunInput({
      flags,
      context: createContext({
        scope: {
          profileId: PROFILE_ID as never,
          profileSlug: "staging",
        },
      }),
    });

    expect(resolved.profileId).toBe(PROFILE_ID);
    expect(resolved.profileSlug).toBe("local-dev");
  });

  it("prefers an explicit positional profile over the ambient project profile id", () => {
    const resolved = resolveProfileRunInput({
      flags,
      context: createContext({
        projectConfig: {
          host: flags.host ?? "https://insecur.test",
          orgId: ORG_ID as never,
          projectId: PROJECT_ID as never,
          defaultEnvId: ENV_ID as never,
          profileId: PROFILE_ID as never,
        },
        scope: {
          profileId: PROFILE_ID as never,
        },
      }),
      profileSelector: "staging",
    });

    expect(resolved.profileId).toBe(OTHER_PROFILE_ID);
    expect(resolved.profileSlug).toBe("staging");
  });
});

describe("resolveProfileRunInput project .insecur.json scope binding", () => {
  let isolatedHome: Awaited<ReturnType<typeof createIsolatedHome>> | undefined;
  let projectDir: string | undefined;

  afterEach(() => {
    isolatedHome?.restore();
    isolatedHome = undefined;
    projectDir = undefined;
  });

  it("loads scope.profileId from project .insecur.json for profile-backed run", async () => {
    isolatedHome = await createIsolatedHome("insecur-cli-run-profile-home-");
    projectDir = await mkdtemp(path.join(tmpdir(), "insecur-cli-run-profile-project-"));
    await writeFile(
      path.join(projectDir, PROJECT_CONFIG_FILE),
      `${JSON.stringify(
        {
          host: flags.host,
          orgId: ORG_ID,
          projectId: PROJECT_ID,
          defaultEnvId: ENV_ID,
          profileId: PROFILE_ID,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await mkdir(path.join(isolatedHome.homeDir, ".insecur"), { recursive: true });
    await writeFile(
      path.join(isolatedHome.homeDir, ".insecur", USER_CONFIG_FILE),
      `${JSON.stringify({ profiles: userConfig.profiles }, null, 2)}\n`,
      "utf8",
    );

    const context = await loadAndResolveCliContext({
      ...flags,
      configDir: projectDir,
    });

    expect(context.scope.profileId).toBe(PROFILE_ID);
    expect(() =>
      assertRunModeExclusive({
        flags: { ...flags, configDir: projectDir },
        context,
      }),
    ).not.toThrow();

    const resolved = resolveProfileRunInput({
      flags: { ...flags, configDir: projectDir },
      context,
    });
    expect(resolved.profileId).toBe(PROFILE_ID);
    expect(resolved.profileSlug).toBe("local-dev");
    expect(resolved.policyId).toBe(POLICY_ID);
  });
});

describe("assertRunModeExclusive project profile selection", () => {
  it("allows profile-backed run when only scope.profileId is present", () => {
    expect(() =>
      assertRunModeExclusive({
        flags,
        context: createContext({
          scope: {
            profileId: PROFILE_ID as never,
          },
        }),
      }),
    ).not.toThrow();
  });

  it("allows profile-backed run when only projectConfig.profileId is present", () => {
    expect(() =>
      assertRunModeExclusive({
        flags,
        context: createContext({
          projectConfig: {
            host: flags.host ?? "https://insecur.test",
            orgId: ORG_ID as never,
            projectId: PROJECT_ID as never,
            defaultEnvId: ENV_ID as never,
            profileId: PROFILE_ID as never,
          },
        }),
      }),
    ).not.toThrow();
  });

  it("allows --variable-key when only scope.profileId supplies ambient defaults", () => {
    expect(() =>
      assertRunModeExclusive({
        flags,
        context: createContext({
          scope: {
            profileId: PROFILE_ID as never,
          },
        }),
        variableKey: "API_KEY",
      }),
    ).not.toThrow();
  });

  it("allows --variable-key when only projectConfig.profileId supplies ambient defaults", () => {
    expect(() =>
      assertRunModeExclusive({
        flags,
        context: createContext({
          projectConfig: {
            host: flags.host ?? "https://insecur.test",
            orgId: ORG_ID as never,
            projectId: PROJECT_ID as never,
            defaultEnvId: ENV_ID as never,
            profileId: PROFILE_ID as never,
          },
        }),
        variableKey: "API_KEY",
      }),
    ).not.toThrow();
  });

  it("rejects when no profile source and no variable key are provided", () => {
    expect(() =>
      assertRunModeExclusive({
        flags,
        context: createContext({}),
      }),
    ).toThrowError(expect.objectContaining({ code: VALIDATION_ERROR_CODES.invalidCommandInput }));
  });
});
