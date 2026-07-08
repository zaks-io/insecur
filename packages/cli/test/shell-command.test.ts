import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLI_ERROR_CODES } from "@insecur/domain";
import { runShellCommand } from "../src/commands/shell.js";
import { runCli } from "../src/program.js";
import { clearMemorySession, setMemorySession } from "../src/session/memory-session.js";
import { USER_CONFIG_FILE } from "../src/config/paths.js";
import { CliError } from "../src/output/cli-error.js";
import { EXIT_VALIDATION } from "../src/output/exit-codes.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { createIsolatedHome } from "./helpers/isolated-home.js";

const PROFILE_ID = "prof_5WG6A9K91A06JKMSSPR6XCFDAK";

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
            displayName: "Local Dev",
            host: "https://insecur.test",
            orgId: "org_01TEST00000000000000000001",
            projectId: "prj_01TEST00000000000000000001",
            envId: "env_01TEST00000000000000000001",
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function mockContext(): ResolvedCliContext {
  return {
    projectConfig: null,
    userConfig: {
      profiles: {
        [PROFILE_ID]: {
          slug: "local-dev",
          displayName: "Local Dev",
          host: "https://insecur.test",
          orgId: "org_01TEST00000000000000000001" as never,
          projectId: "prj_01TEST00000000000000000001" as never,
          envId: "env_01TEST00000000000000000001" as never,
        },
      },
    },
    scope: {
      host: "https://insecur.test",
      orgId: undefined,
      projectId: undefined,
      envId: undefined,
      profileId: undefined,
      profileSlug: undefined,
      profile: undefined,
    },
  };
}

const spawnMock = vi.hoisted(() => vi.fn(async () => 0));

vi.mock("../src/commands/managed-shell.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/commands/managed-shell.js")>();
  return {
    ...actual,
    runInteractiveShell: spawnMock,
  };
});

describe("shell command", () => {
  afterEach(() => {
    clearMemorySession();
    delete process.env.INSECUR_SESSION_TOKEN;
    vi.restoreAllMocks();
    spawnMock.mockReset();
  });

  it("rejects --json with exit 2 and does not start a shell", async () => {
    const isolatedHome = await createIsolatedHome("insecur-cli-shell-home-");
    try {
      await writeUserConfig(isolatedHome.homeDir);
      setMemorySession({
        credential: "credential_test",
        sessionId: "sess_test",
        expiresAt: "2026-01-01T00:00:00.000Z",
      });

      await expect(
        runShellCommand(
          {
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
          },
          "local-dev",
          mockContext(),
        ),
      ).rejects.toMatchObject({
        code: CLI_ERROR_CODES.validationError,
        exitCode: EXIT_VALIDATION,
        message: "insecur shell cannot be combined with --json.",
      } satisfies Partial<CliError>);
      expect(spawnMock).not.toHaveBeenCalled();
    } finally {
      isolatedHome.restore();
    }
  });

  it("rejects --json through the CLI entrypoint", async () => {
    const isolatedHome = await createIsolatedHome("insecur-cli-shell-json-home-");
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      await writeUserConfig(isolatedHome.homeDir);
      setMemorySession({
        credential: "credential_test",
        sessionId: "sess_test",
        expiresAt: "2026-01-01T00:00:00.000Z",
      });

      const exitCode = await runCli(["node", "insecur", "shell", "local-dev", "--json"]);

      expect(exitCode).toBe(EXIT_VALIDATION);
      const parsed = JSON.parse(String(stderr.mock.calls[0]?.[0])) as {
        ok: boolean;
        error: { code: string; message: string };
      };
      expect(parsed).toMatchObject({
        ok: false,
        error: {
          code: CLI_ERROR_CODES.validationError,
          message: "insecur shell cannot be combined with --json.",
        },
      });
      expect(spawnMock).not.toHaveBeenCalled();
    } finally {
      isolatedHome.restore();
    }
  });
});
