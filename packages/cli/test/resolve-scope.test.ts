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

describe("resolveCliScope precedence", () => {
  it("prefers explicit flags over environment variables", () => {
    process.env.INSECUR_HOST = "https://from-env.example";
    process.env.INSECUR_ORG = "org_from_env";
    const scope = resolveCliScope(
      { ...baseFlags, host: "https://from-flag.example", orgId: "org_from_flag" as never },
      null,
      emptyUser,
    );
    expect(scope.host).toBe("https://from-flag.example");
    expect(scope.orgId).toBe("org_from_flag");
    delete process.env.INSECUR_HOST;
    delete process.env.INSECUR_ORG;
  });

  it("falls back to .insecur.json after environment variables", () => {
    process.env.INSECUR_HOST = "https://from-env.example";
    const project: InsecurProjectConfig = {
      host: "https://from-project.example",
      orgId: "org_project" as never,
      projectId: "prj_project" as never,
      defaultEnvId: "env_project" as never,
      profileId: "prof_project" as never,
    };
    const scope = resolveCliScope(baseFlags, project, emptyUser);
    expect(scope.host).toBe("https://from-env.example");
    expect(scope.orgId).toBe("org_project");
    delete process.env.INSECUR_HOST;
  });

  it("uses profile defaults when project config is absent", () => {
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
    const scope = resolveCliScope({ ...baseFlags, profile: "local-dev" }, null, user);
    expect(scope.host).toBe("https://profile.example");
    expect(scope.orgId).toBe("org_profile");
    expect(scope.profile?.slug).toBe("local-dev");
  });
});
