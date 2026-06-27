import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/program.js";
import { clearMemorySession, setMemorySession } from "../src/session/memory-session.js";
import { USER_CONFIG_FILE } from "../src/config/paths.js";
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

describe("shell command registration", () => {
  afterEach(() => {
    clearMemorySession();
    delete process.env.INSECUR_SESSION_TOKEN;
    vi.restoreAllMocks();
  });

  it("passes the commander command object when shell has a profile argument", async () => {
    const isolatedHome = await createIsolatedHome("insecur-cli-shell-home-");
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await writeUserConfig(isolatedHome.homeDir);
      setMemorySession({
        credential: "credential_test",
        sessionId: "sess_test",
        expiresAt: "2026-01-01T00:00:00.000Z",
      });

      const exitCode = await runCli(["node", "insecur", "shell", "local-dev", "--json"]);

      expect(exitCode).toBe(0);
      const parsed = JSON.parse(String(stdout.mock.calls[0]?.[0])) as {
        ok: boolean;
        data: { profileId: string; profileSlug: string; host: string };
      };
      expect(parsed).toMatchObject({
        ok: true,
        data: {
          profileId: PROFILE_ID,
          profileSlug: "local-dev",
        },
      });
      expect(parsed.data.host).toBe("https://insecur.test");
    } finally {
      isolatedHome.restore();
    }
  });
});
