import { describe, expect, it } from "vitest";
import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import {
  assertRunModeExclusive,
  resolveProfileRunInput,
} from "../src/commands/resolve-run-profile.js";
import type { GlobalCliFlags } from "../src/cli-options.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";

const ORG_ID = "org_01TEST00000000000000000001";
const PROJECT_ID = "prj_01TEST00000000000000000001";
const ENV_ID = "env_01TEST0000000000000000001";
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

describe("assertRunModeExclusive project profile selection", () => {
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
