import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROJECT_CONFIG_FILE, USER_CONFIG_FILE } from "../src/config/paths.js";
import { runCli } from "../src/program.js";
import { EXIT_VALIDATION } from "../src/output/exit-codes.js";
import { createIsolatedHome } from "./helpers/isolated-home.js";

const ORG_ID = "org_01TEST00000000000000000001";
const PROJECT_ID = "prj_01TEST00000000000000000001";
const ENV_ID = "env_01TEST00000000000000000001";
const ENV_ID_ALT = "env_01TEST00000000000000000002";
const PROFILE_ID = "prof_01TEST00000000000000000001";

interface TestContext {
  readonly isolatedHome: Awaited<ReturnType<typeof createIsolatedHome>>;
  readonly projectDir: string;
  readonly stdout: { value: string };
  readonly stderr: { value: string };
}

async function writeProjectConfig(projectDir: string): Promise<void> {
  await writeFile(
    path.join(projectDir, PROJECT_CONFIG_FILE),
    `${JSON.stringify(
      {
        host: "https://insecur.test",
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
}

async function writeUserConfig(homeDir: string): Promise<void> {
  const configDir = path.join(homeDir, ".insecur");
  await mkdir(configDir, { recursive: true });
  await writeFile(
    path.join(configDir, USER_CONFIG_FILE),
    `${JSON.stringify(
      {
        profiles: {
          [PROFILE_ID]: {
            slug: "local-dev",
            displayName: "Local development",
            host: "https://insecur.test",
            orgId: ORG_ID,
            projectId: PROJECT_ID,
            envId: ENV_ID,
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function setupTestContext(): Promise<TestContext> {
  const isolatedHome = await createIsolatedHome("insecur-cli-config-commands-home-");
  const projectDir = await mkdtemp(path.join(tmpdir(), "insecur-cli-config-commands-project-"));
  await writeProjectConfig(projectDir);
  await writeUserConfig(isolatedHome.homeDir);
  const stdout = { value: "" };
  const stderr = { value: "" };
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout.value += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.value += String(chunk);
    return true;
  });
  return { isolatedHome, projectDir, stdout, stderr };
}

describe("config show and set commands", () => {
  let context: TestContext | undefined;

  afterEach(() => {
    context?.isolatedHome.restore();
    context = undefined;
    vi.restoreAllMocks();
  });

  it("prints metadata-only resolved config with branch-env map", async () => {
    context = await setupTestContext();
    await writeFile(
      path.join(context.projectDir, PROJECT_CONFIG_FILE),
      `${JSON.stringify(
        {
          host: "https://insecur.test",
          orgId: ORG_ID,
          projectId: PROJECT_ID,
          defaultEnvId: ENV_ID,
          profileId: PROFILE_ID,
          gitBranchToEnvironment: {
            main: ENV_ID_ALT,
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const exitCode = await runCli([
      "node",
      "insecur",
      "config",
      "show",
      "--json",
      "--config-dir",
      context.projectDir,
    ]);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(context.stdout.value) as {
      ok: boolean;
      data: {
        host: string;
        orgId: string;
        projectId: string;
        envId: string;
        branchEnv: Record<string, string>;
        profiles: { profileId: string; slug: string }[];
      };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.data).toMatchObject({
      host: "https://insecur.test",
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      envId: ENV_ID,
      branchEnv: { main: ENV_ID_ALT },
    });
    expect(parsed.data.profiles).toEqual([
      expect.objectContaining({ profileId: PROFILE_ID, slug: "local-dev" }),
    ]);
    expect(context.stdout.value).not.toMatch(/"token"/);
    expect(context.stdout.value).not.toMatch(/"secret"/);
    expect(context.stdout.value).not.toMatch(/"password"/);
  });

  it("round-trips default-env-id through .insecur.json", async () => {
    context = await setupTestContext();

    const setExitCode = await runCli([
      "node",
      "insecur",
      "config",
      "set",
      "default-env-id",
      ENV_ID_ALT,
      "--config-dir",
      context.projectDir,
    ]);
    expect(setExitCode).toBe(0);

    const raw = await readFile(path.join(context.projectDir, PROJECT_CONFIG_FILE), "utf8");
    expect(JSON.parse(raw)).toMatchObject({ defaultEnvId: ENV_ID_ALT });

    context.stdout.value = "";
    const showExitCode = await runCli([
      "node",
      "insecur",
      "config",
      "show",
      "--json",
      "--config-dir",
      context.projectDir,
    ]);
    expect(showExitCode).toBe(0);
    const parsed = JSON.parse(context.stdout.value) as { data: { envId: string } };
    expect(parsed.data.envId).toBe(ENV_ID_ALT);
  });

  it("writes branch-env.main mapping to gitBranchToEnvironment", async () => {
    context = await setupTestContext();

    const exitCode = await runCli([
      "node",
      "insecur",
      "config",
      "set",
      "branch-env.main",
      ENV_ID_ALT,
      "--config-dir",
      context.projectDir,
    ]);
    expect(exitCode).toBe(0);

    const raw = await readFile(path.join(context.projectDir, PROJECT_CONFIG_FILE), "utf8");
    expect(JSON.parse(raw)).toMatchObject({
      gitBranchToEnvironment: { main: ENV_ID_ALT },
    });
  });

  it("round-trips crash-reports through user config", async () => {
    context = await setupTestContext();

    const setExitCode = await runCli([
      "node",
      "insecur",
      "config",
      "set",
      "crash-reports",
      "off",
      "--config-dir",
      context.projectDir,
    ]);
    expect(setExitCode).toBe(0);

    const rawUserConfig = await readFile(
      path.join(context.isolatedHome.homeDir, ".insecur", USER_CONFIG_FILE),
      "utf8",
    );
    expect(JSON.parse(rawUserConfig)).toMatchObject({
      crashReports: "off",
      profiles: {
        [PROFILE_ID]: expect.objectContaining({ slug: "local-dev" }),
      },
    });

    context.stdout.value = "";
    const showExitCode = await runCli([
      "node",
      "insecur",
      "config",
      "show",
      "--json",
      "--config-dir",
      context.projectDir,
    ]);
    expect(showExitCode).toBe(0);
    const parsed = JSON.parse(context.stdout.value) as { data: { crashReports: string } };
    expect(parsed.data.crashReports).toBe("off");
  });

  it("rejects malformed environment ids with validation exit code", async () => {
    context = await setupTestContext();

    const exitCode = await runCli([
      "node",
      "insecur",
      "config",
      "set",
      "branch-env.main",
      "env_invalid",
      "--json",
      "--config-dir",
      context.projectDir,
    ]);

    expect(exitCode).toBe(EXIT_VALIDATION);
    const parsed = JSON.parse(context.stderr.value) as { ok: boolean; error: { code: string } };
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe(VALIDATION_ERROR_CODES.invalidOpaqueResourceId);

    const raw = await readFile(path.join(context.projectDir, PROJECT_CONFIG_FILE), "utf8");
    expect(JSON.parse(raw)).toMatchObject({ defaultEnvId: ENV_ID });
    expect(JSON.parse(raw).gitBranchToEnvironment).toBeUndefined();
  });

  it("rejects malformed crash-reports values", async () => {
    context = await setupTestContext();

    const exitCode = await runCli([
      "node",
      "insecur",
      "config",
      "set",
      "crash-reports",
      "sometimes",
      "--json",
      "--config-dir",
      context.projectDir,
    ]);

    expect(exitCode).toBe(EXIT_VALIDATION);
    const parsed = JSON.parse(context.stderr.value) as {
      ok: boolean;
      error: { code: string; message: string };
    };
    expect(parsed).toMatchObject({
      ok: false,
      error: {
        code: VALIDATION_ERROR_CODES.invalidCommandInput,
        message: "Config key crash-reports must be set to on or off.",
      },
    });
  });

  it("rejects forbidden config keys before writing", async () => {
    context = await setupTestContext();

    const exitCode = await runCli([
      "node",
      "insecur",
      "config",
      "set",
      "accessToken",
      ENV_ID_ALT,
      "--json",
      "--config-dir",
      context.projectDir,
    ]);

    expect(exitCode).toBe(EXIT_VALIDATION);
    const parsed = JSON.parse(context.stderr.value) as { ok: boolean; error: { message: string } };
    expect(parsed.ok).toBe(false);
    expect(parsed.error.message).toMatch(/forbidden/i);

    const raw = await readFile(path.join(context.projectDir, PROJECT_CONFIG_FILE), "utf8");
    expect(JSON.parse(raw)).toMatchObject({ defaultEnvId: ENV_ID });
    expect(raw).not.toMatch(/accessToken/);
  });

  it("rejects forbidden branch names in branch-env keys before writing", async () => {
    context = await setupTestContext();

    const exitCode = await runCli([
      "node",
      "insecur",
      "config",
      "set",
      "branch-env.accessToken",
      ENV_ID_ALT,
      "--json",
      "--config-dir",
      context.projectDir,
    ]);

    expect(exitCode).toBe(EXIT_VALIDATION);
    const parsed = JSON.parse(context.stderr.value) as {
      ok: boolean;
      error: { code: string; message: string };
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe(VALIDATION_ERROR_CODES.invalidCommandInput);
    expect(parsed.error.message).toMatch(/forbidden/i);

    const raw = await readFile(path.join(context.projectDir, PROJECT_CONFIG_FILE), "utf8");
    expect(JSON.parse(raw)).toMatchObject({ defaultEnvId: ENV_ID });
    expect(JSON.parse(raw).gitBranchToEnvironment).toBeUndefined();
  });
});
