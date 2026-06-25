import { describe, expect, it } from "vitest";
import type { GlobalCliFlags } from "../src/cli-options.js";
import { resolveCliScope } from "../src/config/resolve-scope.js";
import type { InsecurProjectConfig } from "../src/config/project-config.js";
import type { CliUserConfig } from "../src/config/user-config.js";

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
  orgId: "org_project" as never,
  projectId: "prj_project" as never,
  defaultEnvId: "env_project" as never,
  profileId: "prof_project" as never,
};

const user: CliUserConfig = {
  profiles: {
    prof_test: {
      slug: "local-dev",
      displayName: "Local development" as never,
      host: "https://profile.example",
      orgId: "org_profile" as never,
      projectId: "prj_profile" as never,
      envId: "env_profile" as never,
    },
  },
};

describe("resolveCliScope precedence", () => {
  it("applies source priority: flag > env > project config > user profile", () => {
    const scopeFromProfile = resolveCliScope({ ...baseFlags, profile: "local-dev" }, null, user);
    expect(scopeFromProfile.host).toBe("https://profile.example");
    expect(scopeFromProfile.orgId).toBe("org_profile");
    expect(scopeFromProfile.projectId).toBe("prj_profile");
    expect(scopeFromProfile.envId).toBe("env_profile");
    expect(scopeFromProfile.profile?.slug).toBe("local-dev");

    const scopeFromProject = resolveCliScope(baseFlags, project, emptyUser);
    expect(scopeFromProject.host).toBe("https://from-project.example");
    expect(scopeFromProject.orgId).toBe("org_project");
    expect(scopeFromProject.projectId).toBe("prj_project");
    expect(scopeFromProject.envId).toBe("env_project");

    process.env.INSECUR_HOST = "https://from-env.example";
    process.env.INSECUR_ORG = "org_from_env";
    process.env.INSECUR_PROJECT = "prj_from_env";
    process.env.INSECUR_ENV = "env_from_env";
    const scopeFromEnv = resolveCliScope(baseFlags, project, user);
    expect(scopeFromEnv.host).toBe("https://from-env.example");
    expect(scopeFromEnv.orgId).toBe("org_from_env");
    expect(scopeFromEnv.projectId).toBe("prj_from_env");
    expect(scopeFromEnv.envId).toBe("env_from_env");

    const scopeFromFlags = resolveCliScope(
      {
        ...baseFlags,
        host: "https://from-flag.example",
        orgId: "org_from_flag" as never,
        projectId: "prj_from_flag" as never,
        envId: "env_from_flag" as never,
      },
      project,
      user,
    );
    expect(scopeFromFlags.host).toBe("https://from-flag.example");
    expect(scopeFromFlags.orgId).toBe("org_from_flag");
    expect(scopeFromFlags.projectId).toBe("prj_from_flag");
    expect(scopeFromFlags.envId).toBe("env_from_flag");

    delete process.env.INSECUR_HOST;
    delete process.env.INSECUR_ORG;
    delete process.env.INSECUR_PROJECT;
    delete process.env.INSECUR_ENV;
  });
});
