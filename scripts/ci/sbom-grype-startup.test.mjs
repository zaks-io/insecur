import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const scannerScript = new URL("./sbom-grype.sh", import.meta.url).pathname;

async function fixture(
  t,
  {
    existing = [],
    installMode = "success",
    unavailable = "",
    installerReportsSuccess = false,
  } = {},
) {
  const directory = await mkdtemp(path.join(tmpdir(), "insecur-scanner-startup-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = path.join(directory, "calls");
  await writeFile(calls, "");
  await mkdir(path.join(directory, "unwritable-prefix"), { mode: 0o555 });
  const localScript = path.join(directory, "sbom-grype.sh");
  await writeFile(localScript, await readFile(scannerScript));
  await writeFile(
    path.join(directory, "install-syft-grype.sh"),
    await readFile(new URL("./install-syft-grype.sh", import.meta.url)),
  );
  const dropPrivileges = installMode === "fail" && process.getuid() === 0;
  if (dropPrivileges) {
    await chmod(directory, 0o777);
    await chmod(calls, 0o666);
  }

  async function tool(name, source) {
    const target = path.join(directory, name);
    await writeFile(target, `#!/bin/bash\nset -euo pipefail\n${source}\n`);
    await chmod(target, 0o755);
  }

  for (const name of ["bash", "dirname", "mktemp", "rm", "awk"]) {
    await symlink(`/usr/bin/${name}`, path.join(directory, name));
  }
  const scanner =
    'name="${0##*/}"\nprintf "%s %s\\n" "$name" "$*" >> "$CALLS"\n' +
    'if [ "$1" != version ] && [ "$name" = syft ]; then exit "${SYFT_EXIT:-0}"; fi\n' +
    'if [ "$name" = grype ] && [ "$1" != version ]; then printf "[]\\n"; exit "${GRYPE_EXIT:-0}"; fi';
  await tool("scanner-template", scanner);
  for (const name of existing) await tool(name, scanner);
  if (installerReportsSuccess) {
    await rm(path.join(directory, "bash"));
    await tool("bash", "exit 0");
    if (installMode === "nonexec") {
      await tool(unavailable, scanner);
      await chmod(path.join(directory, unavailable), 0o644);
    }
  }
  await tool(
    "curl",
    'output="$3"\nurl="$4"\nprintf "download %s\\n" "$url" >> "$CALLS"\n' +
      'if [[ "$url" == *_checksums.txt ]]; then\n' +
      '  archive="${url##*/}"\n  printf "abc %s\\n" "${archive%_checksums.txt}_linux_amd64.tar.gz" > "$output"\n' +
      'else printf archive > "$output"; fi',
  );
  await tool("sha256sum", 'printf "abc %s\\n" "$1"');
  await tool("tar", '/usr/bin/cp "$FIXTURE/scanner-template" "$4/$5"');
  await tool(
    "install",
    'name="${4##*/}"\nprintf "install %s\\n" "$name" >> "$CALLS"\n' +
      'if [ "$INSTALL_MODE" = fail ]; then\n' +
      '  /usr/bin/install -m 0755 "$3" "$FIXTURE/unwritable-prefix/$name"\n  exit\nfi\n' +
      'if [ "$name" = "$UNAVAILABLE" ] && [ "$INSTALL_MODE" = missing ]; then exit 0; fi\n' +
      '/usr/bin/cp "$3" "$FIXTURE/$name"\n' +
      'if [ "$name" = "$UNAVAILABLE" ] && [ "$INSTALL_MODE" = nonexec ]; then\n' +
      '  /usr/bin/chmod 0644 "$FIXTURE/$name"\nelse /usr/bin/chmod 0755 "$FIXTURE/$name"; fi',
  );
  const sbomPath = path.join(directory, "sbom.json");
  const jsonPath = path.join(directory, "reports", "grype.json");
  await symlink("/usr/bin/mkdir", path.join(directory, "mkdir"));
  return {
    sbomPath,
    jsonPath,
    run(extraEnv = {}, threshold = "high") {
      return spawnSync("/bin/bash", [localScript, threshold], {
        cwd: directory,
        encoding: "utf8",
        ...(dropPrivileges ? { uid: 65534, gid: 65534 } : {}),
        env: {
          PATH: directory,
          FIXTURE: directory,
          CALLS: calls,
          INSTALL_MODE: installMode,
          UNAVAILABLE: unavailable,
          SBOM_PATH: sbomPath,
          ...extraEnv,
        },
      });
    },
    async calls() {
      return (await readFile(calls, "utf8")).trim().split("\n").filter(Boolean);
    },
  };
}

test("non-root installation into an unwritable prefix fails before scanning", async (t) => {
  const tools = await fixture(t, { installMode: "fail" });
  const result = tools.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Permission denied/u);
  assert.match(result.stderr, /installation failed; refusing to skip/u);
  assert.ok(!(await tools.calls()).some((call) => /^(syft|grype) /u.test(call)));
});

for (const unavailable of ["syft", "grype"]) {
  for (const installMode of ["missing", "nonexec"]) {
    test(`rejects ${installMode} ${unavailable} after installer reports success`, async (t) => {
      const tools = await fixture(t, {
        existing: [unavailable === "syft" ? "grype" : "syft"],
        installMode,
        unavailable,
        installerReportsSuccess: true,
      });
      const result = tools.run();
      assert.notEqual(result.status, 0);
      assert.ok(!(await tools.calls()).some((call) => call.startsWith("syft scan")));
      assert.match(
        result.stderr,
        new RegExp(`${unavailable} is unavailable after installation`, "u"),
      );
    });
  }
}

for (const existing of [["syft", "grype"], ["syft"], ["grype"]]) {
  test(`reuses PATH scanners ${existing.join(" and ")} without reinstalling them`, async (t) => {
    const tools = await fixture(t, { existing });
    const result = tools.run();
    assert.equal(result.status, 0, result.stderr);
    const calls = await tools.calls();
    for (const name of existing) assert.ok(!calls.includes(`install ${name}`));
    assert.deepEqual(calls.slice(-2), [
      `syft scan dir:. -o cyclonedx-json=${tools.sbomPath}`,
      `grype sbom:${tools.sbomPath} --fail-on high`,
    ]);
  });
}

test("CI-style startup installs both scanners and keeps JSON and high threshold invocations", async (t) => {
  const tools = await fixture(t);
  const result = tools.run({ GRYPE_JSON_PATH: tools.jsonPath });
  assert.equal(result.status, 0, result.stderr);
  const calls = await tools.calls();
  assert.ok(calls.includes("install syft"));
  assert.ok(calls.includes("install grype"));
  assert.deepEqual(calls.slice(-3), [
    `syft scan dir:. -o cyclonedx-json=${tools.sbomPath}`,
    `grype sbom:${tools.sbomPath} -o json`,
    `grype sbom:${tools.sbomPath} --fail-on high`,
  ]);
  assert.equal(await readFile(tools.jsonPath, "utf8"), "[]\n");
});

test("a Grype finding still fails the gate", async (t) => {
  const tools = await fixture(t, { existing: ["syft", "grype"] });
  assert.equal(tools.run({ GRYPE_EXIT: "2" }).status, 2);
});

test("failed SBOM generation does not invoke Grype", async (t) => {
  const tools = await fixture(t, { existing: ["syft", "grype"] });
  assert.equal(tools.run({ SYFT_EXIT: "3" }).status, 3);
  assert.ok(!(await tools.calls()).some((call) => call.startsWith("grype ")));
});
