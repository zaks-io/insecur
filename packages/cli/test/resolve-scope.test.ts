import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GlobalCliFlags } from "../src/cli-options.js";
import { resolveCliScope } from "../src/config/resolve-scope.js";
import type { InsecurProjectConfig } from "../src/config/project-config.js";
import type { CliUserConfig } from "../src/config/user-config.js";

const VALID_ORG_PROJECT = "org_01PROJECT00000000000000001";
const VALID_PROJECT_PROJECT = "prj_01PROJECT00000000000000001";
const VALID_ENV_PROJECT = "env_01PROJECT00000000000000001";
const VALID_PROFILE_PROJECT = "prof_01PROJECT00000000000000001";

const VALID_ORG_PROFILE = "org_01PROFILE00000000000000001";
const VALID_PROJECT_PROFILE = "prj_01PROFILE00000000000000001";
const VALID_ENV_PROFILE = "env_01PROFILE00000000000000001";
const VALID_PROFILE = "prof_01TEST00000000000000000001";

const VALID_ORG_ENV = "org_01FROMENV00000000000000001";
const VALID_PROJECT_ENV = "prj_01FROMENV00000000000000001";
const VALID_ENV_ENV = "env_01FROMENV00000000000000001";

const VALID_ORG_FLAG = "org_01FROMFLAG0000000000000001";
const VALID_PROJECT_FLAG = "prj_01FROMFLAG0000000000000001";
const VALID_ENV_FLAG = "env_01FROMFLAG0000000000000001";

const emptyUser: CliUserConfig = { profiles: {} };

const baseFlags: GlobalCliFlags = {
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
};

const project: InsecurProjectConfig = {
  host: "https://from-project.example",
  orgId: VALID_ORG_PROJECT as never,
  projectId: VALID_PROJECT_PROJECT as never,
  defaultEnvId: VALID_ENV_PROJECT as never,
  profileId: VALID_PROFILE_PROJECT as never,
};

const user: CliUserConfig = {
  profiles: {
    [VALID_PROFILE]: {
      slug: "local-dev",
      displayName: "Local development" as never,
      host: "https://profile.example",
      orgId: VALID_ORG_PROFILE as never,
      projectId: VALID_PROJECT_PROFILE as never,
      envId: VALID_ENV_PROFILE as never,
    },
  },
};

describe("resolveCliScope precedence", () => {
  beforeEach(() => {
    delete process.env.INSECUR_HOST;
    delete process.env.INSECUR_ORG;
    delete process.env.INSECUR_PROJECT;
    delete process.env.INSECUR_ENV;
  });

  afterEach(() => {
    delete process.env.INSECUR_HOST;
    delete process.env.INSECUR_ORG;
    delete process.env.INSECUR_PROJECT;
    delete process.env.INSECUR_ENV;
  });

  it("applies source priority: flag > env > project config > user profile", () => {
    const scopeFromProfile = resolveCliScope({ ...baseFlags, profile: "local-dev" }, null, user);
    expect(scopeFromProfile.host).toBe("https://profile.example");
    expect(scopeFromProfile.orgId).toBe(VALID_ORG_PROFILE);
    expect(scopeFromProfile.projectId).toBe(VALID_PROJECT_PROFILE);
    expect(scopeFromProfile.envId).toBe(VALID_ENV_PROFILE);
    expect(scopeFromProfile.profile?.slug).toBe("local-dev");

    const scopeFromProject = resolveCliScope(baseFlags, project, emptyUser);
    expect(scopeFromProject.host).toBe("https://from-project.example");
    expect(scopeFromProject.orgId).toBe(VALID_ORG_PROJECT);
    expect(scopeFromProject.projectId).toBe(VALID_PROJECT_PROJECT);
    expect(scopeFromProject.envId).toBe(VALID_ENV_PROJECT);
    expect(scopeFromProject.profileId).toBe(VALID_PROFILE_PROJECT);

    process.env.INSECUR_HOST = "https://from-env.example";
    process.env.INSECUR_ORG = VALID_ORG_ENV;
    process.env.INSECUR_PROJECT = VALID_PROJECT_ENV;
    process.env.INSECUR_ENV = VALID_ENV_ENV;
    const scopeFromEnv = resolveCliScope(baseFlags, project, user);
    expect(scopeFromEnv.host).toBe("https://from-env.example");
    expect(scopeFromEnv.orgId).toBe(VALID_ORG_ENV);
    expect(scopeFromEnv.projectId).toBe(VALID_PROJECT_ENV);
    expect(scopeFromEnv.envId).toBe(VALID_ENV_ENV);

    const scopeFromFlags = resolveCliScope(
      {
        ...baseFlags,
        host: "https://from-flag.example",
        orgId: VALID_ORG_FLAG as never,
        projectId: VALID_PROJECT_FLAG as never,
        envId: VALID_ENV_FLAG as never,
      },
      project,
      user,
    );
    expect(scopeFromFlags.host).toBe("https://from-flag.example");
    expect(scopeFromFlags.orgId).toBe(VALID_ORG_FLAG);
    expect(scopeFromFlags.projectId).toBe(VALID_PROJECT_FLAG);
    expect(scopeFromFlags.envId).toBe(VALID_ENV_FLAG);
  });

  it("ignores malformed env scope when valid flags are set", () => {
    process.env.INSECUR_ORG = "org_invalid";
    process.env.INSECUR_PROJECT = "prj_invalid";
    process.env.INSECUR_ENV = "env_invalid";

    const scope = resolveCliScope(
      {
        ...baseFlags,
        orgId: VALID_ORG_FLAG as never,
        projectId: VALID_PROJECT_FLAG as never,
        envId: VALID_ENV_FLAG as never,
      },
      project,
      user,
    );

    expect(scope.orgId).toBe(VALID_ORG_FLAG);
    expect(scope.projectId).toBe(VALID_PROJECT_FLAG);
    expect(scope.envId).toBe(VALID_ENV_FLAG);
  });
});
