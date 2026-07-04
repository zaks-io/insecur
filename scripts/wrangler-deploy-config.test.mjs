import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  hasWranglerConfigArg,
  materializeDeployWranglerConfig,
  normalizeWranglerEnv,
  rebaseConfigPaths,
  selectWranglerScope,
} from "./wrangler-deploy-config.mjs";

const DEPLOY_ENV = {
  INSECUR_API_RATELIMIT_AUTH_EXCHANGE_IP_NAMESPACE_ID: "auth-exchange-ip-ns",
  INSECUR_API_RATELIMIT_BOOTSTRAP_ACTOR_NAMESPACE_ID: "bootstrap-actor-ns",
  INSECUR_API_RATELIMIT_BOOTSTRAP_IP_NAMESPACE_ID: "bootstrap-ip-ns",
  INSECUR_API_RATELIMIT_ONBOARDING_ACTOR_NAMESPACE_ID: "onboarding-actor-ns",
  INSECUR_API_RATELIMIT_ONBOARDING_IP_NAMESPACE_ID: "onboarding-ip-ns",
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
});

test("allows the Site worker without deploy identifier materialization", () => {
  const source = { main: "dist/server/index.js", name: "insecur-site" };

  const config = materializeDeployWranglerConfig(source, { env: DEPLOY_ENV });

  assert.deepEqual(config, source);
});

test("fails when worker name has no deploy materializer", () => {
  assert.throws(
    () => materializeDeployWranglerConfig({ name: "insecur-unknown" }, { env: DEPLOY_ENV }),
    /No deploy-config materializer registered for Worker "insecur-unknown"/,
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

function apiConfig() {
  return {
    env: {
      preview: {
        ratelimits: apiRatelimits(),
        vars: {
          INSTANCE_ID: "INSTANCE_ID_PREVIEW_PLACEHOLDER",
          WORKOS_CLIENT_ID: "WORKOS_CLIENT_ID_PREVIEW_PLACEHOLDER",
        },
      },
    },
    name: "insecur-api",
    ratelimits: apiRatelimits(),
    vars: {
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
          INSTANCE_ID: "INSTANCE_ID_PREVIEW_PLACEHOLDER",
          WORKOS_CLIENT_ID: "WORKOS_CLIENT_ID_PREVIEW_PLACEHOLDER",
        },
      },
    },
    name: "insecur-web",
    vars: {
      INSTANCE_ID: "INSTANCE_ID_PLACEHOLDER",
      WORKOS_CLIENT_ID: "WORKOS_CLIENT_ID_PLACEHOLDER",
    },
  };
}
