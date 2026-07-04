import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  appendDeploySecretsFileArg,
  hasWranglerConfigArg,
  hydrateGeneratedWranglerConfig,
  isFlattenedGeneratedWranglerConfig,
  materializeDeployWranglerConfig,
  normalizeWranglerEnv,
  previewSecretsFileEnvName,
  rebaseConfigPaths,
  selectWranglerScope,
  stripWranglerEnvArgs,
} from "./wrangler-deploy-config.mjs";

const DEPLOY_ENV = {
  INSECUR_API_RATELIMIT_AUTH_EXCHANGE_IP_NAMESPACE_ID: "auth-exchange-ip-ns",
  INSECUR_API_RATELIMIT_BOOTSTRAP_ACTOR_NAMESPACE_ID: "bootstrap-actor-ns",
  INSECUR_API_RATELIMIT_BOOTSTRAP_IP_NAMESPACE_ID: "bootstrap-ip-ns",
  INSECUR_API_RATELIMIT_ONBOARDING_ACTOR_NAMESPACE_ID: "onboarding-actor-ns",
  INSECUR_API_RATELIMIT_ONBOARDING_IP_NAMESPACE_ID: "onboarding-ip-ns",
  INSECUR_DEPLOYED_AT: "2026-07-04T12:00:00.000Z",
  INSECUR_DEPLOY_RUN_ID: "123456789",
  INSECUR_DEPLOY_SHA: "abc123",
  INSECUR_INSTANCE_ID: "instance-live",
  INSECUR_RUNTIME_HYPERDRIVE_ID: "hyperdrive-live",
  INSECUR_RUNTIME_ROOT_KEY_SECRET_NAME: "root-key-secret-live",
  INSECUR_RUNTIME_ROOT_KEY_STORE_ID: "root-key-store-live",
  INSECUR_WORKOS_CLIENT_ID: "workos-live",
};

test("materializes API production deploy identifiers", () => {
  const source = apiConfig();

  const config = materializeDeployWranglerConfig(source, { env: DEPLOY_ENV });

  assert.equal(config.vars.INSTANCE_ID, "instance-live");
  assert.equal(config.vars.WORKOS_CLIENT_ID, "workos-live");
  assert.equal(config.ratelimits[0].namespace_id, "onboarding-ip-ns");
  assert.equal(config.ratelimits[4].namespace_id, "auth-exchange-ip-ns");
  assert.equal(source.vars.INSTANCE_ID, "INSTANCE_ID_PLACEHOLDER");
});

test("materializes runtime preview deploy identifiers", () => {
  const config = materializeDeployWranglerConfig(runtimeConfig(), {
    env: DEPLOY_ENV,
    wranglerEnv: "preview",
  });

  const preview = config.env.preview;
  assert.equal(preview.secrets_store_secrets[0].store_id, "root-key-store-live");
  assert.equal(preview.secrets_store_secrets[0].secret_name, "root-key-secret-live");
  assert.equal(preview.hyperdrive[0].id, "hyperdrive-live");
});

test("materializes Web preview deploy identifiers", () => {
  const config = materializeDeployWranglerConfig(webConfig(), {
    env: DEPLOY_ENV,
    wranglerEnv: "preview",
  });

  assert.equal(config.env.preview.vars.INSTANCE_ID, "instance-live");
  assert.equal(config.env.preview.vars.WORKOS_CLIENT_ID, "workos-live");
  assert.equal(config.env.preview.vars.DEPLOY_SHA, "abc123");
});

test("materializes generated Web preview deploy config", () => {
  const config = materializeDeployWranglerConfig(generatedWebPreviewConfig(), {
    env: DEPLOY_ENV,
    wranglerEnv: "preview",
  });

  assert.equal(config.name, "insecur-web-preview");
  assert.equal(config.main, "index.js");
  assert.equal(config.assets.directory, "../client");
  assert.equal(config.vars.INSTANCE_ID, "instance-live");
  assert.equal(config.vars.WORKOS_CLIENT_ID, "workos-live");
  assert.equal(config.vars.DEPLOY_SHA, "abc123");
});

test("materializes Site preview deploy identity", () => {
  const source = {
    env: { preview: { vars: { DEPLOY_SHA: "DEPLOY_SHA_PREVIEW_PLACEHOLDER" } } },
    main: "dist/server/index.js",
    name: "insecur-site",
    vars: { DEPLOY_SHA: "DEPLOY_SHA_PLACEHOLDER" },
  };

  const config = materializeDeployWranglerConfig(source, {
    env: DEPLOY_ENV,
    wranglerEnv: "preview",
  });

  assert.equal(config.env.preview.vars.DEPLOY_SHA, "abc123");
  assert.equal(config.env.preview.vars.DEPLOY_RUN_ID, "123456789");
  assert.equal(config.env.preview.vars.DEPLOYED_AT, "2026-07-04T12:00:00.000Z");
});

test("materializes generated preview configs by original top-level worker name", () => {
  const config = materializeDeployWranglerConfig(
    {
      env: { preview: { vars: { DEPLOY_SHA: "DEPLOY_SHA_PREVIEW_PLACEHOLDER" } } },
      name: "insecur-site-preview",
      topLevelName: "insecur-site",
      vars: { DEPLOY_SHA: "DEPLOY_SHA_PLACEHOLDER" },
    },
    { env: DEPLOY_ENV, wranglerEnv: "preview" },
  );

  assert.equal(config.env.preview.vars.DEPLOY_SHA, "abc123");
});

test("hydrates generated configs with source env and empty generated binding defaults", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "insecur-wrangler-test-"));
  const sourcePath = path.join(tempDir, "wrangler.jsonc");
  try {
    await writeFile(
      sourcePath,
      JSON.stringify({
        env: {
          preview: {
            name: "insecur-site-preview",
            vars: { DEPLOY_SHA: "DEPLOY_SHA_PREVIEW_PLACEHOLDER" },
          },
        },
      }),
    );

    const hydrated = await hydrateGeneratedWranglerConfig(
      {
        durable_objects: { bindings: [] },
        env: null,
        kv_namespaces: [],
        name: "insecur-site-preview",
        services: [{ binding: "SHOULD_NOT_COPY", service: "non-empty-service" }],
        topLevelName: "insecur-site",
        userConfigPath: sourcePath,
      },
      path.join(tempDir, "dist/server/wrangler.json"),
    );

    assert.deepEqual(hydrated.env.preview.durable_objects, { bindings: [] });
    assert.deepEqual(hydrated.env.preview.kv_namespaces, []);
    assert.equal(hydrated.env.preview.services, undefined);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test("fails when worker name has no deploy materializer", () => {
  assert.throws(
    () => materializeDeployWranglerConfig({ name: "insecur-unknown" }, { env: DEPLOY_ENV }),
    /No deploy-config materializer registered for Worker "insecur-unknown"/,
  );
});

test("fails preview public deploys without deploy identity", () => {
  const env = { ...DEPLOY_ENV };
  delete env.INSECUR_DEPLOY_SHA;

  assert.throws(
    () => materializeDeployWranglerConfig(webConfig(), { env, wranglerEnv: "preview" }),
    /INSECUR_DEPLOY_SHA is required for insecur-web env\.preview deploy config/,
  );
});

test("fails when a selected Wrangler environment scope is missing", () => {
  assert.throws(
    () => selectWranglerScope(apiConfig(), "staging"),
    /Wrangler config has no env\.staging scope/,
  );
});

test("fails when required deploy environment values are missing", () => {
  const env = { ...DEPLOY_ENV };
  delete env.INSECUR_INSTANCE_ID;

  assert.throws(
    () => materializeDeployWranglerConfig(apiConfig(), { env }),
    /INSECUR_INSTANCE_ID is required for insecur-api production deploy config/,
  );
});

test("normalizes Wrangler production aliases to the root scope", () => {
  assert.equal(normalizeWranglerEnv(undefined), undefined);
  assert.equal(normalizeWranglerEnv(""), undefined);
  assert.equal(normalizeWranglerEnv('""'), undefined);
  assert.equal(normalizeWranglerEnv("production"), undefined);
  assert.equal(normalizeWranglerEnv("preview"), "preview");
});

test("rebases relative Wrangler paths into the temp config directory", () => {
  const fromDir = path.resolve("/repo/apps/api");
  const toDir = path.resolve("/tmp/insecur-wrangler-config");

  const config = rebaseConfigPaths(
    { assets: { directory: "public" }, main: "src/index.ts", name: "insecur-api" },
    fromDir,
    toDir,
  );

  assert.equal(config.main, path.relative(toDir, path.resolve(fromDir, "src/index.ts")));
  assert.equal(config.assets.directory, path.relative(toDir, path.resolve(fromDir, "public")));
});

test("detects long and short Wrangler config flags", () => {
  assert.equal(hasWranglerConfigArg(["deploy", "--config", "wrangler.jsonc"]), true);
  assert.equal(hasWranglerConfigArg(["deploy", "--config=wrangler.jsonc"]), true);
  assert.equal(hasWranglerConfigArg(["deploy", "-c", "wrangler.jsonc"]), true);
  assert.equal(hasWranglerConfigArg(["deploy", "-c=wrangler.jsonc"]), true);
  assert.equal(hasWranglerConfigArg(["deploy", "-cwrangler.jsonc"]), true);
  assert.equal(hasWranglerConfigArg(["deploy", "--compatibility-date", "2026-07-03"]), false);
});

test("detects flattened generated Wrangler configs for a selected environment", () => {
  assert.equal(isFlattenedGeneratedWranglerConfig(generatedWebPreviewConfig(), "preview"), true);
  assert.equal(isFlattenedGeneratedWranglerConfig(generatedWebPreviewConfig(), "staging"), false);
  assert.equal(isFlattenedGeneratedWranglerConfig(webConfig(), "preview"), false);
});

test("strips Wrangler environment flags", () => {
  assert.deepEqual(stripWranglerEnvArgs(["deploy", "--env", "preview", "--keep-vars"]), [
    "deploy",
    "--keep-vars",
  ]);
  assert.deepEqual(stripWranglerEnvArgs(["deploy", "--env=preview", "-eproduction", "--dry-run"]), [
    "deploy",
    "--dry-run",
  ]);
});

test("selects preview deploy secrets files by worker without affecting dry-runs", () => {
  const env = {
    INSECUR_API_SECRETS_FILE: "/tmp/api-secrets.json",
    INSECUR_RUNTIME_SECRETS_FILE: "/tmp/runtime-secrets.json",
    INSECUR_WEB_SECRETS_FILE: "/tmp/web-secrets.json",
  };

  assert.equal(previewSecretsFileEnvName(apiConfig(), "preview"), "INSECUR_API_SECRETS_FILE");
  assert.equal(
    previewSecretsFileEnvName(runtimeConfig(), "preview"),
    "INSECUR_RUNTIME_SECRETS_FILE",
  );
  assert.equal(
    previewSecretsFileEnvName(generatedWebPreviewConfig(), "preview"),
    "INSECUR_WEB_SECRETS_FILE",
  );
  assert.equal(previewSecretsFileEnvName(apiConfig(), undefined), undefined);

  assert.deepEqual(
    appendDeploySecretsFileArg(
      ["deploy", "--env", "preview", "--keep-vars"],
      apiConfig(),
      "preview",
      env,
    ),
    ["deploy", "--env", "preview", "--keep-vars", "--secrets-file", "/tmp/api-secrets.json"],
  );
  assert.deepEqual(
    appendDeploySecretsFileArg(
      ["deploy", "--env", "preview", "--dry-run"],
      apiConfig(),
      "preview",
      env,
    ),
    ["deploy", "--env", "preview", "--dry-run"],
  );
});

function apiConfig() {
  return {
    env: {
      preview: {
        ratelimits: apiRatelimits(),
        vars: {
          DEPLOYED_AT: "DEPLOYED_AT_PREVIEW_PLACEHOLDER",
          DEPLOY_RUN_ID: "DEPLOY_RUN_ID_PREVIEW_PLACEHOLDER",
          DEPLOY_SHA: "DEPLOY_SHA_PREVIEW_PLACEHOLDER",
          INSTANCE_ID: "INSTANCE_ID_PREVIEW_PLACEHOLDER",
          WORKOS_CLIENT_ID: "WORKOS_CLIENT_ID_PREVIEW_PLACEHOLDER",
        },
      },
    },
    name: "insecur-api",
    ratelimits: apiRatelimits(),
    vars: {
      DEPLOYED_AT: "DEPLOYED_AT_PLACEHOLDER",
      DEPLOY_RUN_ID: "DEPLOY_RUN_ID_PLACEHOLDER",
      DEPLOY_SHA: "DEPLOY_SHA_PLACEHOLDER",
      INSTANCE_ID: "INSTANCE_ID_PLACEHOLDER",
      WORKOS_CLIENT_ID: "WORKOS_CLIENT_ID_PLACEHOLDER",
    },
  };
}

function apiRatelimits() {
  return [
    { name: "ONBOARDING_IP", namespace_id: "ONBOARDING_IP_PLACEHOLDER" },
    { name: "ONBOARDING_ACTOR", namespace_id: "ONBOARDING_ACTOR_PLACEHOLDER" },
    { name: "BOOTSTRAP_IP", namespace_id: "BOOTSTRAP_IP_PLACEHOLDER" },
    { name: "BOOTSTRAP_ACTOR", namespace_id: "BOOTSTRAP_ACTOR_PLACEHOLDER" },
    { name: "AUTH_EXCHANGE_IP", namespace_id: "AUTH_EXCHANGE_IP_PLACEHOLDER" },
  ];
}

function runtimeConfig() {
  return {
    env: {
      preview: {
        hyperdrive: [{ binding: "HYPERDRIVE", id: "HYPERDRIVE_PREVIEW_PLACEHOLDER" }],
        secrets_store_secrets: [
          {
            binding: "INSTANCE_ROOT_KEY_V1",
            secret_name: "ROOT_KEY_SECRET_PREVIEW_PLACEHOLDER",
            store_id: "ROOT_KEY_STORE_PREVIEW_PLACEHOLDER",
          },
        ],
      },
    },
    hyperdrive: [{ binding: "HYPERDRIVE", id: "HYPERDRIVE_PLACEHOLDER" }],
    name: "insecur-runtime",
    secrets_store_secrets: [
      {
        binding: "INSTANCE_ROOT_KEY_V1",
        secret_name: "ROOT_KEY_SECRET_PLACEHOLDER",
        store_id: "ROOT_KEY_STORE_PLACEHOLDER",
      },
    ],
  };
}

function webConfig() {
  return {
    env: {
      preview: {
        vars: {
          DEPLOYED_AT: "DEPLOYED_AT_PREVIEW_PLACEHOLDER",
          DEPLOY_RUN_ID: "DEPLOY_RUN_ID_PREVIEW_PLACEHOLDER",
          DEPLOY_SHA: "DEPLOY_SHA_PREVIEW_PLACEHOLDER",
          INSTANCE_ID: "INSTANCE_ID_PREVIEW_PLACEHOLDER",
          WORKOS_CLIENT_ID: "WORKOS_CLIENT_ID_PREVIEW_PLACEHOLDER",
        },
      },
    },
    name: "insecur-web",
    vars: {
      DEPLOYED_AT: "DEPLOYED_AT_PLACEHOLDER",
      DEPLOY_RUN_ID: "DEPLOY_RUN_ID_PLACEHOLDER",
      DEPLOY_SHA: "DEPLOY_SHA_PLACEHOLDER",
      INSTANCE_ID: "INSTANCE_ID_PLACEHOLDER",
      WORKOS_CLIENT_ID: "WORKOS_CLIENT_ID_PLACEHOLDER",
    },
  };
}

function generatedWebPreviewConfig() {
  return {
    assets: {
      directory: "../client",
    },
    main: "index.js",
    name: "insecur-web-preview",
    no_bundle: true,
    targetEnvironment: "preview",
    topLevelName: "insecur-web",
    vars: {
      INSTANCE_ID: "INSTANCE_ID_PREVIEW_PLACEHOLDER",
      WORKOS_CLIENT_ID: "WORKOS_CLIENT_ID_PREVIEW_PLACEHOLDER",
    },
  };
}
