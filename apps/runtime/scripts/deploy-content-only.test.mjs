import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareBindingsForSettingsPatch,
  publicDeployVarsAlreadyMatch,
} from "./deploy-content-only-bindings.mjs";
import {
  ensureRequiredPublicDeployBindings,
  mergePublicDeployVarBindings,
  pickDesiredPublicDeployVars,
} from "./deploy-content-only-public-vars.mjs";
import { runContentOnlyDeploy, updatePublicDeployVars } from "./deploy-content-only-lib.mjs";

const PRODUCTION_GET_SETTINGS_BINDINGS = [
  { name: "CF_VERSION_METADATA", type: "version_metadata" },
  {
    name: "SENTRY_DSN",
    type: "plain_text",
    text: "https://example.ingest.sentry.io/1",
  },
  { name: "SENTRY_ENVIRONMENT", type: "plain_text", text: "production" },
  { name: "SENTRY_RELEASE", type: "plain_text", text: "old-sha" },
  { name: "SENTRY_SERVICE", type: "plain_text", text: "insecur-runtime" },
  {
    name: "INSTANCE_ROOT_KEY_V1",
    type: "secrets_store_secret",
    store_id: "00000000000000000000000000000001",
    secret_name: "INSECUR_PUBLIC_PRODUCTION_ROOT_KEY_PLACEHOLDER_V1",
    resource_id: "read-only-from-get",
  },
  {
    name: "DB",
    type: "hyperdrive",
    id: "00000000000000000000000000000002",
    hyperdrive_id: "00000000000000000000000000000002",
  },
  { name: "RUNTIME_TOKEN_SIGNING_SECRET", type: "secret_text" },
];

const PRODUCTION_SETTINGS_WITHOUT_RELEASE = PRODUCTION_GET_SETTINGS_BINDINGS.filter(
  (binding) => binding.name !== "SENTRY_RELEASE",
);

const PRODUCTION_SETTINGS_RESULT = {
  compatibility_date: "2026-05-27",
  compatibility_flags: ["nodejs_compat"],
  observability: {
    enabled: true,
    logs: { enabled: true, destinations: ["axiom-logs"] },
    traces: { enabled: true, destinations: ["axiom-traces"] },
  },
};

const CONTENT_ONLY_DEPLOY_ENV = {
  CLOUDFLARE_ACCOUNT_ID: "account-id",
  CLOUDFLARE_API_TOKEN: "api-token",
  INSECUR_RUNTIME_ROOT_KEY_STORE_ID: "00000000000000000000000000000001",
  INSECUR_RUNTIME_ROOT_KEY_SECRET_NAME: "INSECUR_PUBLIC_PRODUCTION_ROOT_KEY_PLACEHOLDER_V1",
  INSECUR_RUNTIME_HYPERDRIVE_ID: "00000000000000000000000000000002",
  SENTRY_RELEASE: "new-sha",
};

test("pickDesiredPublicDeployVars keeps only public plain-text deploy vars", () => {
  assert.deepEqual(
    pickDesiredPublicDeployVars({
      SENTRY_RELEASE: "abc123",
      SENTRY_SERVICE: "insecur-runtime",
      INSTANCE_ID: "should-not-copy",
    }),
    {
      SENTRY_RELEASE: "abc123",
      SENTRY_SERVICE: "insecur-runtime",
    },
  );
});

test("mergePublicDeployVarBindings updates release vars without touching custody bindings", () => {
  const bindings = [
    { name: "SENTRY_RELEASE", type: "plain_text", text: "old-sha" },
    {
      name: "INSTANCE_ROOT_KEY_V1",
      type: "secrets_store_secret",
      store_id: "store-1",
      secret_name: "root-key",
    },
    { name: "DB", type: "hyperdrive", id: "hyperdrive-1" },
    { name: "RUNTIME_TOKEN_SIGNING_SECRET", type: "secret_text" },
  ];

  const merged = mergePublicDeployVarBindings(bindings, { SENTRY_RELEASE: "new-sha" });

  assert.equal(merged[0].text, "new-sha");
  assert.deepEqual(merged[1], bindings[1]);
  assert.deepEqual(merged[2], bindings[2]);
  assert.deepEqual(merged[3], bindings[3]);
});

test("prepareBindingsForSettingsPatch inherits custody bindings without GET-only fields", () => {
  const { patchBindings } = prepareBindingsForSettingsPatch(PRODUCTION_GET_SETTINGS_BINDINGS, {
    SENTRY_RELEASE: "new-sha",
  });

  assert.deepEqual(
    patchBindings.find((binding) => binding.name === "SENTRY_RELEASE"),
    {
      name: "SENTRY_RELEASE",
      type: "plain_text",
      text: "new-sha",
    },
  );
  for (const name of [
    "CF_VERSION_METADATA",
    "SENTRY_DSN",
    "SENTRY_ENVIRONMENT",
    "SENTRY_SERVICE",
    "INSTANCE_ROOT_KEY_V1",
    "DB",
    "RUNTIME_TOKEN_SIGNING_SECRET",
  ]) {
    assert.deepEqual(
      patchBindings.find((binding) => binding.name === name),
      inheritBinding(name),
    );
  }
});

test("publicDeployVarsAlreadyMatch skips PATCH when release is current", () => {
  assert.equal(
    publicDeployVarsAlreadyMatch(PRODUCTION_GET_SETTINGS_BINDINGS, { SENTRY_RELEASE: "old-sha" }),
    true,
  );
  assert.equal(
    publicDeployVarsAlreadyMatch(PRODUCTION_GET_SETTINGS_BINDINGS, { SENTRY_RELEASE: "new-sha" }),
    false,
  );
});

test("ensureRequiredPublicDeployBindings creates missing SENTRY_RELEASE binding", () => {
  const bindings = [
    {
      name: "INSTANCE_ROOT_KEY_V1",
      type: "secrets_store_secret",
      store_id: "store-1",
      secret_name: "root-key",
    },
    { name: "DB", type: "hyperdrive", id: "hyperdrive-1" },
  ];

  const merged = ensureRequiredPublicDeployBindings(bindings, { SENTRY_RELEASE: "new-sha" });

  assert.equal(merged.find((binding) => binding.name === "SENTRY_RELEASE")?.text, "new-sha");
});

test("updatePublicDeployVars backfills SENTRY_RELEASE on legacy Workers", async () => {
  const calls = [];
  const bindings = await updatePublicDeployVars(
    createSettingsCloudflareJson({
      calls,
      settingsBindings: PRODUCTION_SETTINGS_WITHOUT_RELEASE,
    }),
    "account-id",
    "insecur-runtime",
    { SENTRY_RELEASE: "new-sha" },
  );

  assert.equal(bindings.find((binding) => binding.name === "SENTRY_RELEASE")?.text, "new-sha");
  assert.ok(calls.some((call) => call.method === "PATCH" && call.apiPath.endsWith("/settings")));
});

test("updatePublicDeployVars skips PATCH when public deploy vars already match", async () => {
  const calls = [];
  const bindings = await updatePublicDeployVars(
    createSettingsCloudflareJson({
      calls,
      settingsBindings: PRODUCTION_GET_SETTINGS_BINDINGS,
    }),
    "account-id",
    "insecur-runtime",
    { SENTRY_RELEASE: "old-sha" },
  );

  assert.equal(bindings.find((binding) => binding.name === "SENTRY_RELEASE")?.text, "old-sha");
  assert.equal(
    calls.some((call) => call.method === "PATCH" && call.apiPath.endsWith("/settings")),
    false,
  );
});

test("runContentOnlyDeploy patches public deploy vars after uploading content", async () => {
  const calls = [];

  await runContentOnlyDeploy({
    env: CONTENT_ONLY_DEPLOY_ENV,
    readFileFn: createReadFileStub(),
    fetchFn: createContentOnlyDeployFetchHandler({
      calls,
      settingsBindings: PRODUCTION_GET_SETTINGS_BINDINGS,
    }),
  });

  assert.ok(calls.some((call) => call.method === "PUT" && call.url.endsWith("/content")));
  assert.ok(calls.some((call) => call.method === "PATCH" && call.url.endsWith("/settings")));
});

test("runContentOnlyDeploy backfills missing SENTRY_RELEASE binding", async () => {
  const calls = [];

  await runContentOnlyDeploy({
    env: CONTENT_ONLY_DEPLOY_ENV,
    readFileFn: createReadFileStub(),
    fetchFn: createContentOnlyDeployFetchHandler({
      calls,
      settingsBindings: PRODUCTION_SETTINGS_WITHOUT_RELEASE,
    }),
  });

  const patchCall = calls.find((call) => call.method === "PATCH" && call.url.endsWith("/settings"));
  assert.ok(patchCall);
});

function createReadFileStub() {
  return async (filePath) => {
    if (filePath.endsWith("index.js")) {
      return Buffer.from("export default {};");
    }
    return Buffer.from("{}");
  };
}

function createContentOnlyDeployFetchHandler(options) {
  return (url, init = {}) => routeContentOnlyDeployFetch(url, init, options);
}

async function routeContentOnlyDeployFetch(url, init, { calls, settingsBindings }) {
  const method = init.method ?? "GET";
  calls.push({ url, method });

  if (url.endsWith("/content") && method === "PUT") {
    return jsonResponse({ success: true, result: {} });
  }

  if (url.endsWith("/settings") && method === "PATCH") {
    return respondToSettingsPatch(init.body);
  }

  if (url.endsWith("/settings") && method === "GET") {
    return respondWithSettings(settingsBindings);
  }

  throw new Error(`Unexpected fetch: ${method} ${url}`);
}

function respondWithSettings(settingsBindings) {
  return jsonResponse({
    success: true,
    result: {
      ...PRODUCTION_SETTINGS_RESULT,
      bindings: settingsBindings,
    },
  });
}

async function respondToSettingsPatch(body) {
  assert.ok(body instanceof FormData);
  const settingsBlob = body.get("settings");
  const settings = JSON.parse(await settingsBlob.text());
  const releaseBinding = settings.bindings.find((binding) => binding.name === "SENTRY_RELEASE");
  const rootKeyBinding = settings.bindings.find(
    (binding) => binding.name === "INSTANCE_ROOT_KEY_V1",
  );
  const hyperdriveBinding = settings.bindings.find((binding) => binding.name === "DB");
  const versionMetadataBinding = settings.bindings.find(
    (binding) => binding.name === "CF_VERSION_METADATA",
  );

  assert.equal(releaseBinding?.text, "new-sha");
  assert.deepEqual(rootKeyBinding, inheritBinding("INSTANCE_ROOT_KEY_V1"));
  assert.deepEqual(hyperdriveBinding, inheritBinding("DB"));
  assert.deepEqual(versionMetadataBinding, inheritBinding("CF_VERSION_METADATA"));
  return jsonResponse({ success: true, result: {} });
}

function inheritBinding(name) {
  return {
    name,
    type: "inherit",
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status });
}

function createSettingsCloudflareJson({ calls, settingsBindings }) {
  return async (method, apiPath, init = {}) => {
    calls.push({ method, apiPath });

    if (apiPath.endsWith("/settings") && method === "GET") {
      return {
        ...PRODUCTION_SETTINGS_RESULT,
        bindings: settingsBindings,
      };
    }

    if (apiPath.endsWith("/settings") && method === "PATCH") {
      await respondToSettingsPatch(init.body);
      return {};
    }

    throw new Error(`Unexpected Cloudflare request: ${method} ${apiPath}`);
  };
}
