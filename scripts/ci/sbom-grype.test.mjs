import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = new URL("./sbom-grype.sh", import.meta.url).pathname;

async function executable(directory, name, source) {
  const target = path.join(directory, name);
  await writeFile(target, source, "utf8");
  await chmod(target, 0o755);
}

test("fails when an apparently successful install leaves scanners unavailable", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "insecur-sbom-missing-"));
  try {
    await executable(directory, "bash", "#!/bin/sh\nexit 0\n");
    const result = spawnSync("/bin/bash", [script, "high"], {
      encoding: "utf8",
      env: { PATH: `${directory}:/usr/bin:/bin` },
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unavailable after installation; refusing to skip/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("uses scanners already on PATH without running the installer", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "insecur-sbom-existing-"));
  const callLog = path.join(directory, "calls.log");
  try {
    const fakeTool = '#!/bin/sh\nprintf "%s %s\\n" "$(basename "$0")" "$*" >> "$CALL_LOG"\n';
    await executable(directory, "syft", fakeTool);
    await executable(directory, "grype", fakeTool);
    const result = spawnSync("/bin/bash", [script, "high"], {
      encoding: "utf8",
      env: { CALL_LOG: callLog, PATH: `${directory}:/usr/bin:/bin` },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual((await readFile(callLog, "utf8")).trim().split("\n"), [
      "syft scan dir:. -o cyclonedx-json=sbom.cyclonedx.json",
      "grype sbom:sbom.cyclonedx.json --fail-on high",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
