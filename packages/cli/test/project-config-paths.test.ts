import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadProjectConfig, writeProjectConfig } from "../src/config/project-config.js";
import { PROJECT_CONFIG_FILE, resolveProjectRoot } from "../src/config/paths.js";

let sandbox: string | undefined;

async function directory(...parts: string[]): Promise<string> {
  sandbox ??= await mkdtemp(path.join(tmpdir(), "insecur-project-config-paths-"));
  const result = path.join(sandbox, ...parts);
  await mkdir(result, { recursive: true });
  return result;
}

function fromCwd(cwd: string): void {
  vi.spyOn(process, "cwd").mockReturnValue(cwd);
}

afterEach(async () => {
  vi.restoreAllMocks();
  if (sandbox !== undefined) {
    await rm(sandbox, { recursive: true, force: true });
    sandbox = undefined;
  }
});

describe("project config discovery", () => {
  it("uses the nearest config within a Git directory, including its root", async () => {
    const root = await directory("repo");
    const nested = await directory("repo", "app", "src");
    await mkdir(path.join(root, ".git"));
    await writeFile(path.join(root, PROJECT_CONFIG_FILE), "{}");
    await writeFile(path.join(root, "app", PROJECT_CONFIG_FILE), "{}");
    fromCwd(nested);

    expect(resolveProjectRoot(undefined)).toBe(path.join(root, "app"));
    await rm(path.join(root, "app", PROJECT_CONFIG_FILE));
    expect(resolveProjectRoot(undefined)).toBe(root);
  });

  it("recognizes a worktree .git file without following its gitdir", async () => {
    const root = await directory("worktree");
    const nested = await directory("worktree", "src");
    await writeFile(path.join(root, ".git"), "gitdir: /elsewhere/primary/.git/worktrees/example\n");
    await writeFile(path.join(root, PROJECT_CONFIG_FILE), "{}");
    fromCwd(nested);

    expect(resolveProjectRoot(undefined)).toBe(root);
  });

  it("stops at the first Git boundary and leaves an unconfigured cwd alone", async () => {
    const outer = await directory("outer");
    const inner = await directory("outer", "nested-repo");
    const cwd = await directory("outer", "nested-repo", "app");
    await mkdir(path.join(outer, ".git"));
    await mkdir(path.join(inner, ".git"));
    await writeFile(path.join(outer, PROJECT_CONFIG_FILE), "{}");
    fromCwd(cwd);

    expect(resolveProjectRoot(undefined)).toBe(cwd);
  });

  it("does not find ancestor config without a Git boundary", async () => {
    const outer = await directory("plain");
    const cwd = await directory("plain", "child");
    await writeFile(path.join(outer, PROJECT_CONFIG_FILE), "{}");
    fromCwd(cwd);

    expect(resolveProjectRoot(undefined)).toBe(cwd);
    await writeFile(path.join(cwd, PROJECT_CONFIG_FILE), "{}");
    expect(resolveProjectRoot(undefined)).toBe(cwd);
  });

  it("uses an explicit relative directory exactly", async () => {
    const root = await directory("repo");
    const cwd = await directory("repo", "app");
    const explicit = await directory("repo", "other");
    await mkdir(path.join(root, ".git"));
    await writeFile(path.join(root, PROJECT_CONFIG_FILE), "{}");
    fromCwd(cwd);

    expect(resolveProjectRoot("../other")).toBe(explicit);
  });

  it("reads and writes the same ancestor config without creating a shadow file", async () => {
    const root = await directory("repo");
    const cwd = await directory("repo", "app");
    await mkdir(path.join(root, ".git"));
    fromCwd(cwd);
    const config = {
      host: "local",
      projectId: "prj_01TEST00000000000000000001" as never,
      defaultEnvId: "env_01TEST00000000000000000001" as never,
      profileId: "prof_01TEST00000000000000000001" as never,
    };
    await writeFile(path.join(root, PROJECT_CONFIG_FILE), JSON.stringify(config));

    expect(await loadProjectConfig(undefined)).toMatchObject(config);
    expect(await writeProjectConfig(undefined, config)).toBe(path.join(root, PROJECT_CONFIG_FILE));
    expect(JSON.parse(await readFile(path.join(root, PROJECT_CONFIG_FILE), "utf8"))).toMatchObject(
      config,
    );
    await expect(lstat(path.join(cwd, PROJECT_CONFIG_FILE))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("fails on an invalid discovered config", async () => {
    const root = await directory("repo");
    const cwd = await directory("repo", "app");
    await mkdir(path.join(root, ".git"));
    await writeFile(path.join(root, PROJECT_CONFIG_FILE), "not JSON");
    fromCwd(cwd);

    await expect(loadProjectConfig(undefined)).rejects.toThrow();
  });
});
