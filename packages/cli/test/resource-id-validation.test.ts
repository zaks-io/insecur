import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseGlobalOptions } from "../src/cli-options.js";
import { loadProjectConfig } from "../src/config/project-config.js";
import { resolveCliScope } from "../src/config/resolve-scope.js";
import { loadUserConfig } from "../src/config/user-config.js";
import { CliError } from "../src/output/cli-error.js";
import { EXIT_VALIDATION } from "../src/output/exit-codes.js";

const VALID_ORG = "org_01TEST00000000000000000001";
const VALID_PROJECT = "prj_01TEST00000000000000000001";
const VALID_ENV = "env_01TEST00000000000000000001";
const VALID_PROFILE = "prof_01TEST00000000000000000001";

const baseFlags = {
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

function isInvalidOpaqueResourceId(error: unknown): boolean {
  if (!(error instanceof CliError)) {
    return false;
  }
  return (
    error.code === VALIDATION_ERROR_CODES.invalidOpaqueResourceId &&
    error.exitCode === EXIT_VALIDATION
  );
}

describe("CLI opaque resource id validation", () => {
  let projectDir: string;
  let homeDir: string;
  let originalHome: string | undefined;

  afterEach(() => {
    delete process.env.INSECUR_ORG;
    delete process.env.INSECUR_PROJECT;
    delete process.env.INSECUR_ENV;
    delete process.env.HOME;
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    vi.restoreAllMocks();
  });

  it("rejects malformed global flag ids before scope resolution", () => {
    expect(() => parseGlobalOptions({ orgId: "org_invalid" }).flags).toThrowError(CliError);
    expect(() => parseGlobalOptions({ projectId: "prj_invalid" }).flags).toThrowError(CliError);
    expect(() => parseGlobalOptions({ envId: "env_invalid" }).flags).toThrowError(CliError);
    expect(() => parseGlobalOptions({ profileId: "prof_invalid" }).flags).toThrowError(CliError);
  });

  it("rejects malformed environment-derived scope ids", () => {
    vi.stubEnv("INSECUR_ORG", "org_invalid");
    expect(() => resolveCliScope(baseFlags, null, { profiles: {} })).toThrowError(CliError);
    vi.unstubAllEnvs();

    vi.stubEnv("INSECUR_PROJECT", "prj_invalid");
    expect(() => resolveCliScope(baseFlags, null, { profiles: {} })).toThrowError(CliError);
    vi.unstubAllEnvs();

    vi.stubEnv("INSECUR_ENV", "env_invalid");
    expect(() => resolveCliScope(baseFlags, null, { profiles: {} })).toThrowError(CliError);
    vi.unstubAllEnvs();
  });

  it("rejects malformed ids in .insecur.json during config load", async () => {
    projectDir = await mkdtemp(path.join(tmpdir(), "insecur-cli-project-config-"));
    await writeFile(
      path.join(projectDir, ".insecur.json"),
      JSON.stringify({
        host: "https://insecur.test",
        orgId: "org_invalid",
        projectId: VALID_PROJECT,
        defaultEnvId: VALID_ENV,
        profileId: VALID_PROFILE,
      }),
      "utf8",
    );
    await expect(loadProjectConfig(projectDir)).rejects.toSatisfy(isInvalidOpaqueResourceId);

    await writeFile(
      path.join(projectDir, ".insecur.json"),
      JSON.stringify({
        host: "https://insecur.test",
        orgId: VALID_ORG,
        projectId: VALID_PROJECT,
        defaultEnvId: VALID_ENV,
        profileId: VALID_PROFILE,
        gitBranchToEnvironment: {
          main: "env_invalid",
        },
      }),
      "utf8",
    );
    await expect(loadProjectConfig(projectDir)).rejects.toSatisfy(isInvalidOpaqueResourceId);
  });

  it("rejects malformed ids in user config during config load", async () => {
    homeDir = await mkdtemp(path.join(tmpdir(), "insecur-cli-home-"));
    originalHome = process.env.HOME;
    process.env.HOME = homeDir;
    const configDir = path.join(homeDir, ".insecur");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, "config.json"),
      JSON.stringify({
        profiles: {
          [VALID_PROFILE]: {
            slug: "local-dev",
            displayName: "Local development",
            host: "https://insecur.test",
            orgId: "org_invalid",
            projectId: VALID_PROJECT,
            envId: VALID_ENV,
          },
        },
      }),
      "utf8",
    );
    await expect(loadUserConfig()).rejects.toSatisfy(isInvalidOpaqueResourceId);

    await writeFile(
      path.join(configDir, "config.json"),
      JSON.stringify({
        profiles: {
          prof_invalid: {
            slug: "local-dev",
            displayName: "Local development",
            host: "https://insecur.test",
            orgId: VALID_ORG,
            projectId: VALID_PROJECT,
            envId: VALID_ENV,
          },
        },
      }),
      "utf8",
    );
    await expect(loadUserConfig()).rejects.toSatisfy(isInvalidOpaqueResourceId);
  });

  it("does not call HTTP when global flags contain malformed ids", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    expect(() =>
      parseGlobalOptions({
        orgId: "org_invalid",
        projectId: VALID_PROJECT,
        envId: VALID_ENV,
      }),
    ).toThrowError(CliError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
