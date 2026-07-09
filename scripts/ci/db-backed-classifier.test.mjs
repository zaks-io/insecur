import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

test("CI classifies every package with a test:rls suite as DB-backed", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const packagesDir = new URL("../../packages/", import.meta.url);
  const packageNames = await readdir(packagesDir);

  for (const packageName of packageNames) {
    let manifest;
    try {
      manifest = JSON.parse(
        await readFile(new URL(`${packageName}/package.json`, packagesDir), "utf8"),
      );
    } catch {
      continue;
    }
    if (manifest.scripts?.["test:rls"] !== undefined) {
      assert.match(workflow, new RegExp(`packages/${packageName.replaceAll("-", "\\-")}\/\\*`));
    }
  }
});
