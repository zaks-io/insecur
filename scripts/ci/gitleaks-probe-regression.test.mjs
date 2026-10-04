import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const repo = path.resolve(import.meta.dirname, "../..");
const configPath = path.join(repo, ".gitleaks.toml");
const probes = [
  {
    name: "setup-doc",
    rule: "curl-auth-header",
    file: "docs/setup.md",
    narrow: "^ins_live_\\.\\.\\.$",
    wide: "^ins_live",
  },
  {
    name: "workflow-config",
    rule: "generic-api-key",
    file: "docs/agents/workflow/config.md",
    narrow: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    wide: ".*",
  },
  {
    name: "probe-script",
    rule: "curl-auth-header",
    file: "scripts/ci/gitleaks-setup-doc-probe.sh",
    narrow: "^ins_live_" + "supersecrettoken1234567890$",
    wide: "^ins_live",
  },
];
const scannerAvailable = spawnSync("gitleaks", ["version"]).status === 0;

async function withFixture(probe, check) {
  const directory = await mkdtemp(path.join(tmpdir(), "insecur-gitleaks-probe-"));
  const originalConfig = await readFile(configPath);
  try {
    await mkdir(path.join(directory, "scripts/ci"), { recursive: true });
    for (const file of ["gitleaks-probe-lib.sh", `gitleaks-${probe.name}-probe.sh`]) {
      await copyFile(path.join(repo, "scripts/ci", file), path.join(directory, "scripts/ci", file));
    }
    if (probe.name !== "probe-script") {
      await mkdir(path.dirname(path.join(directory, probe.file)), { recursive: true });
      await copyFile(path.join(repo, probe.file), path.join(directory, probe.file));
    }
    await writeFile(path.join(directory, ".gitleaks.toml"), originalConfig);
    await check(directory, originalConfig.toString());
    assert.deepEqual(
      await readFile(configPath),
      originalConfig,
      "repo config must remain byte-identical",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function runProbe(directory, probe, env = process.env) {
  const targetConfig = path.join(directory, ".gitleaks.toml");
  const before = readFileSync(targetConfig);
  const result = spawnSync(
    "/bin/bash",
    [path.join(directory, "scripts/ci", `gitleaks-${probe.name}-probe.sh`)],
    {
      encoding: "utf8",
      env,
    },
  );
  assert.deepEqual(
    readFileSync(targetConfig),
    before,
    "each probe must leave its target config byte-identical",
  );
  return result;
}

for (const probe of probes) {
  test(
    `${probe.name}: real scanner detects the intended fixture; a widened allowlist fails`,
    {
      skip: !scannerAvailable && "gitleaks not installed; CI Secret scan installs it",
    },
    async () => {
      await withFixture(probe, async (directory, config) => {
        assert.equal(runProbe(directory, probe).status, 0);
        const widened = config.replace(probe.narrow, probe.wide);
        assert.notEqual(widened, config, "the negative control must actually widen the allowlist");
        await writeFile(path.join(directory, ".gitleaks.toml"), widened);
        const result = runProbe(directory, probe);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /expected findings exit 1, got 0/u);
        assert.equal(await readFile(path.join(directory, ".gitleaks.toml"), "utf8"), widened);
      });
    },
  );

  test(
    `${probe.name}: malformed scanner config cannot pass`,
    { skip: !scannerAvailable },
    async () => {
      await withFixture(probe, async (directory) => {
        await writeFile(path.join(directory, ".gitleaks.toml"), "[malformed");
        assert.notEqual(runProbe(directory, probe).status, 0);
        assert.equal(await readFile(path.join(directory, ".gitleaks.toml"), "utf8"), "[malformed");
      });
    },
  );

  test(`${probe.name}: scanner startup, report, and finding errors cannot pass`, async () => {
    await withFixture(probe, async (directory) => {
      const bin = path.join(directory, "bin");
      await mkdir(bin);
      // A truly missing binary must fail, even when no system gitleaks is installed.
      for (const tool of ["dirname", "mktemp", "rm", "mkdir", "cp", "awk", "jq"]) {
        const resolved = spawnSync("/bin/bash", ["-c", 'command -v "$1"', "--", tool], {
          encoding: "utf8",
        });
        assert.equal(resolved.status, 0, `${tool} is required to run the probes`);
        await symlink(resolved.stdout.trim(), path.join(bin, tool));
      }
      const env = { ...process.env, PATH: bin };
      const missing = runProbe(directory, probe, env);
      assert.notEqual(missing.status, 0);
      assert.match(missing.stderr, /got 127/u);

      const line =
        probe.name === "probe-script"
          ? 2
          : (await readFile(path.join(repo, probe.file), "utf8")).split("\n").length;
      const finding = { RuleID: probe.rule, File: probe.file, StartLine: line };
      const report = path.join(directory, "mock-report.json");
      const stub = path.join(bin, "gitleaks");
      await writeFile(
        stub,
        `#!/bin/bash
while [ "$#" -gt 0 ]; do
  if [ "$1" = --report-path ]; then
    cp "$MOCK_REPORT" "$2"
    break
  fi
  shift
done
exit "$MOCK_EXIT"
`,
      );
      await chmod(stub, 0o755);
      const cases = [
        { exit: "0", json: [finding] },
        { exit: "2", json: [finding] },
        { exit: "127", json: [finding] },
        { exit: "1", json: [] },
        { exit: "1", json: [{ ...finding, RuleID: "wrong-rule" }] },
        { exit: "1", json: [{ ...finding, File: "unrelated.txt" }] },
        { exit: "1", json: [{ ...finding, StartLine: line + 1 }] },
        { exit: "1", json: [finding, finding] },
        { exit: "1", raw: "not json" },
      ];
      for (const failure of cases) {
        await writeFile(report, failure.raw ?? JSON.stringify(failure.json));
        const result = runProbe(directory, probe, {
          ...env,
          MOCK_REPORT: report,
          MOCK_EXIT: failure.exit,
        });
        assert.notEqual(result.status, 0, `must reject ${JSON.stringify(failure)}`);
        assert.doesNotMatch(result.stderr + result.stdout, /wrong-rule|unrelated\.txt|not json/u);
      }
      await writeFile(report, JSON.stringify([finding]));
      assert.equal(
        runProbe(directory, probe, { ...env, MOCK_REPORT: report, MOCK_EXIT: "1" }).status,
        0,
      );
      await rm(report);
      assert.notEqual(
        runProbe(directory, probe, { ...env, MOCK_REPORT: report, MOCK_EXIT: "1" }).status,
        0,
      );
    });
  });
}

test("CI runs the exact-token probe alongside the existing detect/probe wrapper", async () => {
  const workflow = await readFile(path.join(repo, ".github/workflows/ci.yml"), "utf8");
  assert.match(
    workflow,
    /bash scripts\/ci\/gitleaks-detect\.sh detect\n\s+bash scripts\/ci\/gitleaks-probe-script-probe\.sh/u,
  );
});
