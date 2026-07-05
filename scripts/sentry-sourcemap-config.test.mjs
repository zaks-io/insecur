import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveSentrySourcemapConfig } from "./sentry-sourcemap-config.mjs";
import { hasSourceMap, uploadWranglerSourcemaps } from "./sentry-upload-wrangler-sourcemaps.mjs";
import {
  isSourceMapArtifact,
  parseReleaseFilesList,
  releaseHasSourceMapArtifacts,
  verifyReleaseSourcemaps,
} from "./sentry-verify-release-sourcemaps.mjs";

test("deploy workflows read SENTRY_AUTH_TOKEN from repository or environment secrets", async () => {
  const { readFile } = await import("node:fs/promises");
  const workflows = [
    ".github/workflows/deploy-preview.yml",
    ".github/workflows/deploy-production.yml",
  ];

  for (const workflowPath of workflows) {
    const source = await readFile(new URL(`../${workflowPath}`, import.meta.url), "utf8");
    assert.match(
      source,
      /SENTRY_AUTH_TOKEN:\s*\$\{\{\s*secrets\.SENTRY_AUTH_TOKEN\s*\}\}/,
      `${workflowPath} must read secrets.SENTRY_AUTH_TOKEN`,
    );
    assert.doesNotMatch(
      source,
      /secrets\.PREVIEW_SENTRY_AUTH_TOKEN|secrets\.PRODUCTION_SENTRY_AUTH_TOKEN/,
      `${workflowPath} must not require environment-prefixed Sentry token secret names`,
    );
  }
});

test("resolveSentrySourcemapConfig skips when auth token is absent", () => {
  assert.deepEqual(resolveSentrySourcemapConfig({}), {
    action: "skip",
    reason: "missing_auth_token",
  });
});

test("resolveSentrySourcemapConfig fails closed when upload is required", () => {
  assert.throws(
    () =>
      resolveSentrySourcemapConfig({
        INSECUR_REQUIRE_SENTRY_SOURCEMAPS: "true",
      }),
    /repository Actions secret SENTRY_AUTH_TOKEN/u,
  );
});

test("resolveSentrySourcemapConfig requires release when auth token is present", () => {
  assert.throws(
    () =>
      resolveSentrySourcemapConfig({
        SENTRY_AUTH_TOKEN: "token-value",
      }),
    /SENTRY_RELEASE or INSECUR_DEPLOY_SHA is required/u,
  );
});

test("resolveSentrySourcemapConfig resolves release from deploy sha", () => {
  assert.deepEqual(
    resolveSentrySourcemapConfig({
      SENTRY_AUTH_TOKEN: "token-value",
      INSECUR_DEPLOY_SHA: "abc123def456",
    }),
    {
      action: "upload",
      authToken: "token-value",
      org: "zaksio",
      project: "insecur",
      release: "abc123def456",
    },
  );
});

test("resolveSentrySourcemapConfig prefers explicit release metadata", () => {
  assert.deepEqual(
    resolveSentrySourcemapConfig({
      SENTRY_AUTH_TOKEN: "token-value",
      SENTRY_RELEASE: "release-explicit",
      INSECUR_DEPLOY_SHA: "abc123def456",
      SENTRY_ORG: "custom-org",
      SENTRY_PROJECT: "custom-project",
    }),
    {
      action: "upload",
      authToken: "token-value",
      org: "custom-org",
      project: "custom-project",
      release: "release-explicit",
    },
  );
});

test("hasSourceMap finds nested map files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insecur-sentry-maps-"));
  try {
    const nested = path.join(root, "server");
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(nested, "index.js"), "console.log('x');\n");
    await writeFile(path.join(nested, "index.js.map"), '{"version":3}\n');
    assert.equal(await hasSourceMap(root), true);
    assert.equal(await hasSourceMap(path.join(root, "empty")), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("uploadWranglerSourcemaps skips when auth token is absent", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insecur-sentry-upload-skip-"));
  try {
    assert.deepEqual(await uploadWranglerSourcemaps(root, {}), {
      action: "skip",
      reason: "missing_auth_token",
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("uploadWranglerSourcemaps fails closed when required maps are missing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insecur-sentry-upload-required-"));
  try {
    await assert.rejects(
      () =>
        uploadWranglerSourcemaps(root, {
          INSECUR_REQUIRE_SENTRY_SOURCEMAPS: "true",
          SENTRY_AUTH_TOKEN: "token-value",
          SENTRY_RELEASE: "release-1",
        }),
      /No source maps found in .* required Sentry source map upload cannot be skipped/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("uploadWranglerSourcemaps skips missing maps when upload is not required", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insecur-sentry-upload-optional-"));
  try {
    assert.deepEqual(
      await uploadWranglerSourcemaps(root, {
        SENTRY_AUTH_TOKEN: "token-value",
        SENTRY_RELEASE: "release-1",
      }),
      {
        action: "skip",
        reason: "missing_source_maps",
      },
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("verifyReleaseSourcemaps skips when auth token is absent", () => {
  assert.deepEqual(verifyReleaseSourcemaps({}), {
    action: "skip",
    reason: "missing_auth_token",
  });
});

test("parseReleaseFilesList ignores blank lines", () => {
  assert.deepEqual(parseReleaseFilesList("~/index.js\n\n~/index.js.map\n"), [
    "~/index.js",
    "~/index.js.map",
  ]);
});

test("releaseHasSourceMapArtifacts requires at least one map artifact", () => {
  assert.equal(releaseHasSourceMapArtifacts(["~/index.js", "~/assets/client.js"]), false);
  assert.equal(releaseHasSourceMapArtifacts(["~/index.js.map"]), true);
  assert.equal(isSourceMapArtifact("~/index.js.map"), true);
});

test("worker deploy scripts upload wrangler source maps after deploy", async () => {
  const packages = [
    ["apps/api/package.json", "dist"],
    ["apps/runtime/package.json", "dist"],
    ["apps/web/package.json", "dist/server"],
    ["apps/site/package.json", "dist/server"],
  ];

  for (const [packagePath, mapDir] of packages) {
    const pkg = await readPackage(packagePath);
    for (const scriptName of ["deploy", "deploy:preview"]) {
      const script = pkg.scripts[scriptName];
      assert.match(
        script,
        new RegExp(`sentry-upload-wrangler-sourcemaps\\.mjs ${mapDir.replace("/", "\\/")}`),
        `${packagePath} ${scriptName} must upload ${mapDir} source maps`,
      );
    }
  }
});

async function readPackage(relativePath) {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  return readFile(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8").then(
    JSON.parse,
  );
}
