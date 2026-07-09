import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production requires a successful real preview smoke for the exact deploy SHA", async () => {
  const production = await readFile(
    new URL("../../.github/workflows/deploy-production.yml", import.meta.url),
    "utf8",
  );
  const previewSmoke = await readFile(
    new URL("../../.github/workflows/preview-smoke.yml", import.meta.url),
    "utf8",
  );

  assert.match(production, /actions\/workflows\/preview-smoke\.yml\/runs\?head_sha=\$DEPLOY_SHA/u);
  assert.match(production, /\.conclusion == "success"/u);
  assert.match(previewSmoke, /SMOKE_EXPECTED_DEPLOY_SHA: \$\{\{ github\.sha \}\}/u);
  assert.doesNotMatch(previewSmoke, /inputs\.expected_sha/u);
});
