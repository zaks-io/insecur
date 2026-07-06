import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildArtifactBundlesUrl,
  countReleaseArtifactBundleFiles,
  fetchReleaseArtifactBundles,
  parseArtifactBundlesPayload,
  releaseHasArtifactBundleSourcemaps,
  waitForReleaseArtifactBundles,
} from "./sentry-artifact-bundles.mjs";
import {
  buildSentryCliEnv,
  resolveSentryCliInvocation,
  SENTRY_CLI_TIMEOUT_MS,
} from "./sentry-cli.mjs";
import { runPostDeploySentrySourcemaps } from "./post-deploy-sentry-sourcemaps.mjs";
import { resolveSentrySourcemapConfig } from "./sentry-sourcemap-config.mjs";
import { hasSourceMap, uploadWranglerSourcemaps } from "./sentry-upload-wrangler-sourcemaps.mjs";
import { verifyReleaseSourcemaps } from "./sentry-verify-release-sourcemaps.mjs";

const verifySourcemapEnv = {
  SENTRY_AUTH_TOKEN: "token-value",
  SENTRY_RELEASE: "release-1",
};

const noUploadedArtifactBundlePattern =
  /has no uploaded artifact bundle source maps for project insecur/u;

function resolveImmediately() {
  return Promise.resolve();
}

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

test("verifyReleaseSourcemaps skips when auth token is absent", async () => {
  assert.deepEqual(await verifyReleaseSourcemaps({}), {
    action: "skip",
    reason: "missing_auth_token",
  });
});

test("parseArtifactBundlesPayload accepts array and paginated payloads", () => {
  assert.deepEqual(parseArtifactBundlesPayload([{ bundleId: "a" }]), [{ bundleId: "a" }]);
  assert.deepEqual(parseArtifactBundlesPayload({ data: [{ bundleId: "b" }] }), [{ bundleId: "b" }]);
  assert.deepEqual(parseArtifactBundlesPayload({}), []);
});

test("releaseHasArtifactBundleSourcemaps requires uploaded files for the release", () => {
  assert.equal(
    releaseHasArtifactBundleSourcemaps(
      [{ fileCount: 0, associations: [{ release: "release-1" }] }],
      "release-1",
    ),
    false,
  );
  assert.equal(
    releaseHasArtifactBundleSourcemaps(
      [{ fileCount: 3, associations: [{ release: "other-release" }] }],
      "release-1",
    ),
    false,
  );
  assert.equal(
    releaseHasArtifactBundleSourcemaps(
      [{ fileCount: 2, associations: [{ release: "release-1" }] }],
      "release-1",
    ),
    true,
  );
});

test("releaseHasArtifactBundleSourcemaps accepts query-scoped bundles without associations", () => {
  const release = "release-1";
  const uploadedBundle = { bundleId: "bundle-1", fileCount: 3 };

  assert.equal(releaseHasArtifactBundleSourcemaps([uploadedBundle], release), true);
  assert.equal(
    releaseHasArtifactBundleSourcemaps([{ ...uploadedBundle, associations: [] }], release),
    true,
  );
  assert.equal(
    releaseHasArtifactBundleSourcemaps([{ ...uploadedBundle, associations: undefined }], release),
    true,
  );
  assert.equal(countReleaseArtifactBundleFiles([uploadedBundle], release), 3);
});

test("buildArtifactBundlesUrl queries artifact bundles for the deployed release", () => {
  assert.equal(
    buildArtifactBundlesUrl(
      {
        action: "upload",
        authToken: "token-value",
        org: "zaksio",
        project: "insecur",
        release: "release-1",
      },
      { SENTRY_URL: "https://sentry.example/" },
    ),
    "https://sentry.example/api/0/projects/zaksio/insecur/files/artifact-bundles/?query=release-1",
  );
});

test("fetchReleaseArtifactBundles parses artifact bundle payloads", async () => {
  const bundles = await fetchReleaseArtifactBundles(
    {
      action: "upload",
      authToken: "token-value",
      org: "zaksio",
      project: "insecur",
      release: "release-1",
    },
    {},
    {
      fetchFn: async () =>
        new Response(
          JSON.stringify([
            {
              bundleId: "bundle-1",
              fileCount: 4,
              associations: [{ release: "release-1", dist: null }],
            },
          ]),
          { status: 200 },
        ),
    },
  );

  assert.equal(bundles.length, 1);
  assert.equal(countReleaseArtifactBundleFiles(bundles, "release-1"), 4);
});

test("fetchReleaseArtifactBundles times out stalled Sentry responses", async () => {
  const abortError = new Error("The operation was aborted");
  abortError.name = "TimeoutError";

  await assert.rejects(
    () =>
      fetchReleaseArtifactBundles(
        {
          action: "upload",
          authToken: "token-value",
          org: "zaksio",
          project: "insecur",
          release: "release-1",
        },
        {},
        {
          requestTimeoutMs: 50,
          fetchFn: async (_url, init) =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener("abort", () => reject(abortError));
            }),
        },
      ),
    /Sentry artifact bundle lookup timed out after 50ms for release release-1\./u,
  );
});

test("waitForReleaseArtifactBundles polls until bundles appear", async () => {
  let attempts = 0;
  const bundles = await waitForReleaseArtifactBundles(
    {
      action: "upload",
      authToken: "token-value",
      org: "zaksio",
      project: "insecur",
      release: "release-1",
    },
    {},
    {
      maxWaitMs: 1_000,
      pollIntervalMs: 10,
      sleepFn: resolveImmediately,
      fetchBundles: async () => {
        attempts += 1;
        if (attempts < 2) {
          return [];
        }
        return [{ fileCount: 1, associations: [{ release: "release-1" }] }];
      },
    },
  );

  assert.equal(attempts, 2);
  assert.equal(releaseHasArtifactBundleSourcemaps(bundles, "release-1"), true);
});

test("waitForReleaseArtifactBundles returns last bundles when maxWaitMs elapses", async () => {
  let currentTime = 0;
  const lastEmptyBundles = [{ fileCount: 0, associations: [{ release: "release-1" }] }];
  let fetchCount = 0;

  const bundles = await waitForReleaseArtifactBundles(
    {
      action: "upload",
      authToken: "token-value",
      org: "zaksio",
      project: "insecur",
      release: "release-1",
    },
    {},
    {
      maxWaitMs: 100,
      pollIntervalMs: 25,
      nowFn: () => currentTime,
      sleepFn: (durationMs) => {
        currentTime += durationMs;
        return Promise.resolve();
      },
      fetchBundles: async () => {
        fetchCount += 1;
        return lastEmptyBundles;
      },
    },
  );

  assert.ok(fetchCount >= 2);
  assert.deepEqual(bundles, lastEmptyBundles);
  assert.equal(releaseHasArtifactBundleSourcemaps(bundles, "release-1"), false);
});

test("verifyReleaseSourcemaps fails closed when artifact bundle lookup finds no uploads", async () => {
  let currentTime = 0;
  const immediateDeadlineOptions = {
    maxWaitMs: 1,
    pollIntervalMs: 1,
    nowFn: () => currentTime,
    sleepFn: (durationMs) => {
      currentTime += durationMs;
      return Promise.resolve();
    },
    fetchBundles: async () => [],
  };

  await assert.rejects(
    () => verifyReleaseSourcemaps(verifySourcemapEnv, immediateDeadlineOptions),
    noUploadedArtifactBundlePattern,
  );

  await assert.rejects(
    () =>
      verifyReleaseSourcemaps(verifySourcemapEnv, {
        ...immediateDeadlineOptions,
        fetchBundles: async () => [{ fileCount: 0, associations: [{ release: "release-1" }] }],
      }),
    noUploadedArtifactBundlePattern,
  );

  await assert.rejects(
    () =>
      verifyReleaseSourcemaps(verifySourcemapEnv, {
        ...immediateDeadlineOptions,
        fetchBundles: async () => [{ fileCount: 3, associations: [{ release: "other-release" }] }],
      }),
    noUploadedArtifactBundlePattern,
  );
});

test("verifyReleaseSourcemaps succeeds with mocked artifact bundle lookup", async () => {
  const result = await verifyReleaseSourcemaps(verifySourcemapEnv, {
    fetchBundles: async () => [
      {
        bundleId: "bundle-1",
        fileCount: 2,
        associations: [{ release: "release-1", dist: null }],
      },
    ],
  });

  assert.deepEqual(result, {
    action: "verify",
    release: "release-1",
    fileCount: 2,
  });
});

test("buildSentryCliEnv preserves proxy and CA runtime vars while overlaying Sentry credentials", () => {
  const env = buildSentryCliEnv(
    {
      authToken: "resolved-token",
      org: "zaksio",
      project: "insecur",
      release: "abc123",
    },
    {
      PATH: "/usr/bin",
      HTTP_PROXY: "http://proxy.example",
      NODE_EXTRA_CA_CERTS: "/etc/ssl/certs.pem",
      SENTRY_AUTH_TOKEN: "unrelated-token",
      DATABASE_URL: "postgres://example",
    },
  );

  assert.equal(env.SENTRY_AUTH_TOKEN, "resolved-token");
  assert.equal(env.PATH, "/usr/bin");
  assert.equal(env.HTTP_PROXY, "http://proxy.example");
  assert.equal(env.NODE_EXTRA_CA_CERTS, "/etc/ssl/certs.pem");
  assert.equal(env.DATABASE_URL, undefined);
});

test("SENTRY_CLI_TIMEOUT_MS is a positive finite timeout", () => {
  assert.equal(Number.isFinite(SENTRY_CLI_TIMEOUT_MS), true);
  assert.ok(SENTRY_CLI_TIMEOUT_MS > 0);
});

test("resolveSentryCliInvocation uses the repo-installed @sentry/cli launcher", () => {
  const invocation = resolveSentryCliInvocation();

  assert.equal(invocation.command, process.execPath);
  assert.match(invocation.argsPrefix[0], /@sentry\/cli[/\\]bin[/\\]sentry-cli$/u);
});

test("resolveSentryCliInvocation fails clearly when @sentry/cli is missing", () => {
  assert.throws(
    () =>
      resolveSentryCliInvocation({
        resolveFrom: import.meta.url,
        require: {
          resolve() {
            throw Object.assign(new Error("Cannot find module '@sentry/cli/bin/sentry-cli'"), {
              code: "MODULE_NOT_FOUND",
            });
          },
        },
      }),
    /sentry-cli is not installed/u,
  );
});

test("runPostDeploySentrySourcemaps labels upload failures for operators", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insecur-sentry-post-deploy-"));
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => {
    logs.push(args.join(" "));
  };

  try {
    await assert.rejects(
      () =>
        runPostDeploySentrySourcemaps("insecur-site", root, {
          INSECUR_REQUIRE_SENTRY_SOURCEMAPS: "true",
          SENTRY_AUTH_TOKEN: "token-value",
          SENTRY_RELEASE: "release-1",
        }),
      /required Sentry source map upload cannot be skipped/u,
    );
    assert.match(logs.join("\n"), /insecur-site post-deploy Sentry source map upload failed/u);
  } finally {
    console.error = originalError;
    await rm(root, { force: true, recursive: true });
  }
});

test("worker deploy scripts upload wrangler source maps after deploy", async () => {
  const packages = [
    ["apps/api/package.json", "dist", "dist"],
    ["apps/runtime/package.json", "dist", "dist"],
    ["apps/web/package.json", "dist", "dist/server"],
    ["apps/site/package.json", "dist", "dist/server"],
  ];

  for (const [packagePath, outdir, mapDir] of packages) {
    const pkg = await readPackage(packagePath);
    for (const scriptName of ["deploy", "deploy:preview"]) {
      const script = pkg.scripts[scriptName];
      assert.match(
        script,
        /Worker deploy failed before Sentry source map upload/u,
        `${packagePath} ${scriptName} must label Worker deploy failures before source map upload`,
      );
      assert.match(
        script,
        new RegExp(`post-deploy-sentry-sourcemaps\\.mjs [^ ]+ ${mapDir.replace("/", "\\/")}`),
        `${packagePath} ${scriptName} must upload ${mapDir} source maps via post-deploy wrapper`,
      );
      assertOutdirMatchesMapDir({
        script,
        packagePath,
        scriptName,
        outdir,
        mapDir,
      });
    }
  }
});

function assertOutdirMatchesMapDir({ script, packagePath, scriptName, outdir, mapDir }) {
  const outdirMatch = script.match(/--outdir\s+([^\s]+)/u);
  if (outdirMatch) {
    const allowedMapDirs = [outdirMatch[1], path.posix.join(outdirMatch[1], "server")];
    assert.ok(
      allowedMapDirs.includes(mapDir),
      `${packagePath} ${scriptName}: --outdir ${outdirMatch[1]} must align with post-deploy map dir ${mapDir}`,
    );
    assert.equal(
      outdirMatch[1],
      outdir,
      `${packagePath} ${scriptName}: --outdir must stay ${outdir}`,
    );
    return;
  }

  if (packagePath === "apps/runtime/package.json" && scriptName === "deploy") {
    assert.match(
      script,
      /deploy-content-only\.mjs/u,
      `${packagePath} ${scriptName} must deploy content into ${mapDir}`,
    );
    assert.equal(mapDir, outdir);
    return;
  }

  assert.fail(`${packagePath} ${scriptName} must pass --outdir ${outdir} for map dir alignment`);
}

async function readPackage(relativePath) {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  return readFile(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8").then(
    JSON.parse,
  );
}
