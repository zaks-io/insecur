import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { WRANGLER_TYPE_TARGETS } from "../wrangler-types.mjs";

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
