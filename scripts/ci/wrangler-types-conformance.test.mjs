import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { runWranglerTypes, WRANGLER_TYPE_TARGETS } from "../wrangler-types.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("WRANGLER_TYPE_TARGETS covers the four Worker deploys", () => {
  assert.deepEqual(
    WRANGLER_TYPE_TARGETS.map((target) => target.app),
    ["api", "runtime", "web", "site"],
  );
});

test("wrangler types --check passes for the committed Worker fleet declarations", () => {
  const result = spawnSync(process.execPath, ["scripts/wrangler-types.mjs", "--check"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(
    result.status,
    0,
    `wrangler types --check failed:\n${result.stdout}\n${result.stderr}`,
  );
});

test("the app option checks only the requested Worker and rejects invalid apps", () => {
  const checked = spawnSync(
    process.execPath,
    ["scripts/wrangler-types.mjs", "--app", "api", "--check"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(checked.status, 0, `${checked.stdout}\n${checked.stderr}`);
  assert.equal(checked.stdout.match(/Types at .* are up to date/g)?.length, 1);

  for (const app of ["unknown", ""]) {
    const invalid = spawnSync(
      process.execPath,
      ["scripts/wrangler-types.mjs", "--app", app, "--check"],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /Unknown Worker app/);
    assert.equal(invalid.stdout, "");
  }
});

test("developer dotenv and process keys do not hide real Worker configuration drift", () => {
  const cwd = mkdtempSync(join(repoRoot, "node_modules", ".wrangler-types-"));
  const previousIncludeProcessEnv = process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV;
  const config = {
    name: "wrangler-types-fixture",
    main: "src/index.js",
    compatibility_date: "2026-07-01",
    vars: { CONFIGURED_VARIABLE: "fixture" },
  };

  try {
    mkdirSync(join(cwd, "src"));
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({ name: "wrangler-types-fixture", private: true }),
    );
    writeFileSync(join(cwd, "src", "index.js"), "export default {};\n");
    writeFileSync(join(cwd, "wrangler.jsonc"), JSON.stringify(config));
    const generated = runWranglerTypes(cwd, "generate");
    assert.equal(generated.status, 0, `${generated.stdout}\n${generated.stderr}`);

    writeFileSync(join(cwd, ".dev.vars"), "LOCAL_DEV_VARIABLE=fixture\n");
    writeFileSync(join(cwd, ".env"), "LOCAL_ENV_VARIABLE=fixture\n");
    process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = "true";
    const checked = runWranglerTypes(cwd, "check");
    assert.equal(checked.status, 0, `${checked.stdout}\n${checked.stderr}`);

    config.vars.NEW_CONFIGURED_VARIABLE = "fixture";
    writeFileSync(join(cwd, "wrangler.jsonc"), JSON.stringify(config));
    const stale = runWranglerTypes(cwd, "check");
    assert.notEqual(stale.status, 0);
    assert.match(`${stale.stdout}\n${stale.stderr}`, /out of date/);
  } finally {
    if (previousIncludeProcessEnv === undefined) {
      delete process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV;
    } else {
      process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = previousIncludeProcessEnv;
    }
    rmSync(cwd, { recursive: true, force: true });
  }
});
