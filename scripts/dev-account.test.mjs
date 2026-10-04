import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));

test("local account seeding refuses a remote database before touching Worker config", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx/esm", "packages/tenant-store/scripts/dev-account.ts", "--name", "alice"],
    {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_URL_MIGRATION: "postgres://fixture:fixture-password@db.example.test/insecur",
      },
      encoding: "utf8",
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /only writes to loopback Postgres/);
  assert.doesNotMatch(result.stderr, /fixture-password/);
});

test("local account seeding rejects unsafe names before connecting", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx/esm", "packages/tenant-store/scripts/dev-account.ts", "--name", "../alice"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Use --name/);
});
