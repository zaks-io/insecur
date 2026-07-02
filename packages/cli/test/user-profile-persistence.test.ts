import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadUserConfig } from "../src/config/user-config.js";
import { USER_CONFIG_FILE } from "../src/config/paths.js";
import { createIsolatedHome } from "./helpers/isolated-home.js";

const VALID_ORG = "org_01TEST00000000000000000001";
const VALID_PROJECT = "prj_01TEST00000000000000000001";
const VALID_ENV = "env_01TEST00000000000000000001";
const PROFILE_ID = "prof_01TEST00000000000000000001";

describe("CLI user profile persistence", () => {
  let isolatedHome: Awaited<ReturnType<typeof createIsolatedHome>> | undefined;

  afterEach(() => {
    isolatedHome?.restore();
    isolatedHome = undefined;
  });

  it("loads only opaque ids, slug, display name, host, and scope defaults", async () => {
    isolatedHome = await createIsolatedHome("insecur-cli-user-config-");
    const configDir = path.join(isolatedHome.homeDir, ".insecur");
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
              orgId: VALID_ORG,
              projectId: VALID_PROJECT,
              envId: VALID_ENV,
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const config = await loadUserConfig();
    const profile = config.profiles[PROFILE_ID as never];
    expect(profile).toEqual({
      slug: "local-dev",
      displayName: "Local development",
      host: "https://insecur.test",
      orgId: VALID_ORG,
      projectId: VALID_PROJECT,
      envId: VALID_ENV,
    });
    expect(Object.keys(profile as object).sort()).toEqual(
      ["displayName", "envId", "host", "orgId", "projectId", "slug"].sort(),
    );
  });
});
