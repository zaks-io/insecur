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

  it("round-trips local project config without orgId", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "insecur-cli-local-config-"));
    await writeProjectConfig(dir, {
      host: "local",
      projectId: "prj_01TEST00000000000000000001" as never,
      defaultEnvId: "env_01TEST00000000000000000001" as never,
      profileId: "prof_01TEST00000000000000000001" as never,
      secretShapes: [
        {
          variableKey: "INSECUR_PROOF_SECRET" as never,
          displayName: "First value proof" as never,
          generationHint: "random:32",
        },
      ],
    });
    const loaded = await loadProjectConfig(dir);
    expect(loaded?.host).toBe("local");
    expect(loaded?.orgId).toBeUndefined();
    expect(loaded?.secretShapes).toHaveLength(1);
  });
});
