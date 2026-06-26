import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadProjectConfig, writeProjectConfig } from "../src/config/project-config.js";

describe("project config", () => {
  let dir: string;

  afterEach(() => {
    delete process.env.INSECUR_SESSION_TOKEN;
  });

  it("round-trips opaque ids without forbidden keys", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "insecur-cli-config-"));
    await writeProjectConfig(dir, {
      host: "https://insecur.test",
      orgId: "org_01TEST00000000000000000001" as never,
      projectId: "prj_01TEST00000000000000000001" as never,
      defaultEnvId: "env_01TEST00000000000000000001" as never,
      profileId: "prof_01TEST00000000000000000001" as never,
    });
    const loaded = await loadProjectConfig(dir);
    expect(loaded?.orgId).toBe("org_01TEST00000000000000000001");
    const raw = await readFile(path.join(dir, ".insecur.json"), "utf8");
    expect(raw).not.toMatch(/"token"/);
  });
});
