import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  commandOutput,
  expect,
  expectJsonStdoutOnly,
  lastJson,
  parseJsonLines,
  redact,
  run,
} from "./local-feature-suite-support.mjs";

const childPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "local-feature-suite-worktree-child.mjs",
);

function syntheticValue() {
  return randomBytes(48).toString("base64url");
}

export async function runWorktreeChecks({ check, cliPath, env }) {
  await check("linked Git worktree uses the project config and isolated local values", async () => {
    const fixture = await realpath(await mkdtemp(path.join(tmpdir(), "insecur-local-worktree-")));
    const repo = path.join(fixture, "repo");
    const linked = path.join(fixture, "linked");
    const nested = path.join(linked, "packages", "example");
    const decoy = path.join(fixture, "other-project");
    const expectedPath = path.join(fixture, "expected-value.txt");
    const markerPath = path.join(fixture, "child-ran.txt");
    const values = [syntheticValue(), syntheticValue(), syntheticValue(), syntheticValue()];
    const [selected, ambient, unrelated, decoyValue] = values;
    let linkedAdded = false;

    async function git(args, cwd) {
      const result = await run("git", args, { cwd, env });
      expect(
        result.code === 0,
        `git ${args[0]} exited ${result.code}: ${redact(commandOutput(result))}`,
      );
    }

    async function cli(args, cwd, options = {}) {
      const result = await run("node", [cliPath, "--json", ...args], {
        cwd,
        env: { ...env, ...options.env },
        stdin: options.stdin,
      });
      expect(
        values.every((value) => !commandOutput(result).includes(value)),
        "CLI or child output included a synthetic credential",
      );
      return result;
    }

    function succeeded(result, label) {
      expect(result.code === 0, `${label} exited ${result.code}: ${redact(commandOutput(result))}`);
      expectJsonStdoutOnly(result, label);
      return lastJson(result, label);
    }

    async function configAt(directory) {
      return JSON.parse(await readFile(path.join(directory, ".insecur.json"), "utf8"));
    }

    try {
      await git(["init", "-q", "-b", "main", repo], fixture);
      const initial = succeeded(await cli(["init"], repo), "repository init");
      succeeded(
        await cli(["secrets", "set", "WORKTREE_SECRET", "--value-stdin"], repo, {
          stdin: selected,
        }),
        "primary checkout secret write",
      );
      const originalConfig = await configAt(repo);
      expect(initial.ok === true, "repository init did not succeed");
      const repoNested = path.join(repo, "nested");
      await mkdir(repoNested);
      succeeded(await cli(["secrets", "list"], repoNested), "ordinary repository discovery");
      await git(["add", ".insecur.json"], repo);
      await git(
        [
          "-c",
          "user.name=Local Feature Suite",
          "-c",
          "user.email=local-feature-suite@example.invalid",
          "commit",
          "-q",
          "-m",
          "Add local project config",
        ],
        repo,
      );
      await git(["worktree", "add", "--detach", linked, "HEAD"], repo);
      linkedAdded = true;
      await mkdir(nested, { recursive: true });
      expect((await stat(path.join(linked, ".git"))).isFile(), "linked worktree has no .git file");
      expect(
        (await configAt(linked)).projectId === originalConfig.projectId,
        "linked config differs from committed config",
      );

      await mkdir(decoy);
      succeeded(await cli(["init"], decoy), "other project init");
      const decoyConfig = await configAt(decoy);
      expect(
        decoyConfig.projectId !== originalConfig.projectId,
        "other project reused the fixture project ID",
      );
      succeeded(
        await cli(["secrets", "set", "INSECUR_PROOF_SECRET", "--value-stdin"], decoy, {
          stdin: decoyValue,
        }),
        "other project missing-key seed",
      );
      succeeded(
        await cli(["secrets", "set", "WORKTREE_SECRET", "--value-stdin"], decoy, {
          stdin: decoyValue,
        }),
        "other project same-key seed",
      );

      const missingPlan = succeeded(
        await cli(
          [
            "run",
            "--variable-key",
            "INSECUR_PROOF_SECRET",
            "--plan",
            "--",
            "node",
            "-e",
            "process.exit(0)",
          ],
          nested,
        ),
        "missing-value plan",
      );
      expect(missingPlan.data.plan.ready === false, "another project's value made the plan ready");
      expect(
        missingPlan.data.projectConfigPath === path.join(linked, ".insecur.json"),
        "missing-value plan selected the wrong config",
      );
      const missingRun = await cli(
        [
          "run",
          "--variable-key",
          "INSECUR_PROOF_SECRET",
          "--",
          "node",
          "-e",
          "require('node:fs').writeFileSync(process.argv[1], 'ran')",
          markerPath,
        ],
        nested,
        { env: { INSECUR_PROOF_SECRET: ambient } },
      );
      expect(missingRun.code !== 0, "missing-value run succeeded");
      expect(
        typeof lastJson(missingRun, "missing-value run").error?.code === "string",
        "missing-value run did not report an error",
      );
      expect(!existsSync(markerPath), "missing-value run started the child");

      await writeFile(expectedPath, selected, "utf8");
      succeeded(
        await cli(["secrets", "set", "NESTED_SECRET", "--value-stdin"], nested, {
          stdin: selected,
        }),
        "nested secret write",
      );
      expect(
        (await configAt(linked)).secretShapes.some(
          (shape) => shape.variableKey === "NESTED_SECRET",
        ),
        "nested write missed the worktree root manifest",
      );
      expect(
        !existsSync(path.join(nested, ".insecur.json")),
        "nested write created a shadow config",
      );

      const plan = succeeded(
        await cli(
          [
            "run",
            "--variable-key",
            "WORKTREE_SECRET",
            "--plan",
            "--",
            "node",
            childPath,
            expectedPath,
            nested,
          ],
          nested,
        ),
        "selected-value plan",
      );
      expect(plan.data.plan.ready === true, "selected-value plan is blocked");
      expect(
        plan.data.projectConfigPath === path.join(linked, ".insecur.json"),
        "selected-value plan selected the wrong config",
      );
      const injected = await cli(
        ["run", "--variable-key", "WORKTREE_SECRET", "--", "node", childPath, expectedPath, nested],
        nested,
        {
          env: {
            WORKTREE_SECRET: ambient,
            UNRELATED_WORKTREE_CREDENTIAL: unrelated,
            INSECUR_SESSION_TOKEN: decoyValue,
          },
        },
      );
      expect(
        injected.code === 0,
        `linked run exited ${injected.code}: ${redact(commandOutput(injected))}`,
      );
      expect(
        parseJsonLines(injected.stderr)[0]?.ok === true,
        "child did not receive the selected value in its original cwd",
      );
      expect(
        lastJson(injected.stdout, "linked run").data.childExitCode === 0,
        "CLI did not report child success",
      );

      const importValue = syntheticValue();
      values.push(importValue);
      await writeFile(path.join(nested, ".env"), `WORKTREE_IMPORTED=${importValue}\n`, "utf8");
      const imported = succeeded(await cli(["import", ".env"], nested), "nested import");
      expect(imported.data.importedCount === 1, "nested import count changed");
      expect(
        (await configAt(linked)).secretShapes.some(
          (shape) => shape.variableKey === "WORKTREE_IMPORTED",
        ),
        "nested import missed the worktree root manifest",
      );
      expect(
        !existsSync(path.join(nested, ".insecur.json")),
        "nested import created a shadow config",
      );

      const explicit = succeeded(
        await cli(["--config-dir", nested, "config", "show"], nested),
        "explicit config directory",
      );
      expect(
        explicit.data.projectConfigPath === undefined,
        "explicit config directory walked to the parent config",
      );
      const beforeNestedInit = await readFile(path.join(linked, ".insecur.json"), "utf8");
      succeeded(await cli(["init"], nested), "nested init");
      expect(existsSync(path.join(nested, ".insecur.json")), "init did not write to the exact cwd");
      expect(
        (await configAt(nested)).projectId !== originalConfig.projectId,
        "nested init reused the parent project",
      );
      expect(
        (await readFile(path.join(linked, ".insecur.json"), "utf8")) === beforeNestedInit,
        "nested init overwrote the parent config",
      );

      const outside = path.join(fixture, "outside-git");
      const outsideNested = path.join(outside, "nested");
      await mkdir(outsideNested, { recursive: true });
      succeeded(await cli(["init"], outside), "outside-Git init");
      const outsideConfig = succeeded(
        await cli(["config", "show"], outsideNested),
        "outside-Git config",
      );
      expect(
        outsideConfig.data.projectConfigPath === undefined,
        "outside-Git config discovery walked to the parent",
      );

      return { linkedWorktree: true, childCwdPreserved: true, projectValuesIsolated: true };
    } finally {
      if (linkedAdded) await git(["worktree", "remove", "--force", linked], repo);
      await rm(fixture, { recursive: true, force: true });
    }
  });
}
