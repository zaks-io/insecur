import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadDeployWranglerConfig } from "../../../scripts/wrangler-deploy-config.mjs";

import {
  prepareBindingsForSettingsPatch,
  publicDeployVarsAlreadyMatch,
} from "./deploy-content-only-bindings.mjs";
import { createCloudflareJson } from "./deploy-content-only-cloudflare.mjs";
import {
  ensureRequiredPublicDeployBindings,
  pickDesiredPublicDeployVars,
} from "./deploy-content-only-public-vars.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = path.resolve(SCRIPT_DIR, "..");
const WRANGLER_PATH = path.join(RUNTIME_DIR, "wrangler.jsonc");
const DIST_DIR = path.join(RUNTIME_DIR, "dist");
const MAIN_MODULE = "index.js";
const SOURCE_MAP = "index.js.map";

export {
  applyPublicDeployVarBindings,
  ensureRequiredPublicDeployBindings,
  mergePublicDeployVarBindings,
  pickDesiredPublicDeployVars,
} from "./deploy-content-only-public-vars.mjs";

export async function updatePublicDeployVars(
  cloudflareJson,
  accountId,
  scriptName,
  desiredPublicVars,
) {
  const settings = await cloudflareJson(
    "GET",
    `/accounts/${accountId}/workers/scripts/${scriptName}/settings`,
  );
  const existingBindings = settings.bindings ?? [];

  if (publicDeployVarsAlreadyMatch(existingBindings, desiredPublicVars)) {
    return ensureRequiredPublicDeployBindings(existingBindings, desiredPublicVars);
  }

  const { merged, patchBindings } = prepareBindingsForSettingsPatch(
    existingBindings,
    desiredPublicVars,
  );
  ensureRequiredPublicDeployBindings(merged, desiredPublicVars);

  const form = new FormData();
  form.append(
    "settings",
    new Blob([JSON.stringify({ bindings: patchBindings })], { type: "application/json" }),
    "settings.json",
  );

  await cloudflareJson("PATCH", `/accounts/${accountId}/workers/scripts/${scriptName}/settings`, {
    body: form,
  });

  return merged;
}

export async function runContentOnlyDeploy(options = {}) {
  const context = await createContentOnlyDeployContext(options);

  await assertDeployedRuntimeConfig(
    context.cloudflareJson,
    context.accountId,
    context.scriptName,
    context.config,
  );
  await putScriptContent(
    context.cloudflareJson,
    context.accountId,
    context.scriptName,
    context.readFileFn,
  );
  await updatePublicDeployVars(
    context.cloudflareJson,
    context.accountId,
    context.scriptName,
    context.desiredPublicVars,
  );

  console.log(
    `Uploaded ${context.scriptName} content and refreshed public deploy vars without changing Worker bindings.`,
  );
}

async function createContentOnlyDeployContext(options) {
  const env = options.env ?? process.env;
  if (env.CLOUDFLARE_ENV && env.CLOUDFLARE_ENV !== "production") {
    throw new Error(
      "Runtime content-only deploy is production-only. Use deploy:preview for preview.",
    );
  }

  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID", env);
  const apiToken = requireEnv("CLOUDFLARE_API_TOKEN", env);
  const { config } = await loadDeployWranglerConfig(WRANGLER_PATH, { env });
  const scriptName = assertString(config.name, "wrangler.name");
  const desiredPublicVars = pickDesiredPublicDeployVars(config.vars);

  if (!desiredPublicVars.SENTRY_RELEASE) {
    throw new Error(
      "SENTRY_RELEASE or INSECUR_DEPLOY_SHA is required for runtime content-only deploy.",
    );
  }

  return {
    accountId,
    cloudflareJson: createCloudflareJson(apiToken, options.fetchFn ?? fetch),
    config,
    desiredPublicVars,
    readFileFn: options.readFileFn ?? readFile,
    scriptName,
  };
}

async function assertDeployedRuntimeConfig(cloudflareJson, accountId, scriptName, config) {
  const settings = await cloudflareJson(
    "GET",
    `/accounts/${accountId}/workers/scripts/${scriptName}/settings`,
  );

  if (settings.compatibility_date !== config.compatibility_date) {
    throw new Error(
      `Refusing content-only deploy: deployed compatibility_date ${settings.compatibility_date} does not match ${config.compatibility_date}.`,
    );
  }

  assertSetEqual(
    settings.compatibility_flags ?? [],
    config.compatibility_flags ?? [],
    "compatibility_flags",
  );
  assertObservability(settings.observability, config.observability);

  const bindings = settings.bindings ?? [];
  const desiredRootKey = only(config.secrets_store_secrets, "secrets_store_secrets");
  assertBinding(bindings, {
    name: desiredRootKey.binding,
    type: "secrets_store_secret",
    store_id: desiredRootKey.store_id,
    secret_name: desiredRootKey.secret_name,
  });

  const desiredHyperdrive = only(config.hyperdrive, "hyperdrive");
  assertBinding(bindings, {
    name: desiredHyperdrive.binding,
    type: "hyperdrive",
    id: desiredHyperdrive.id,
  });

  assertBinding(bindings, {
    name: "RUNTIME_TOKEN_SIGNING_SECRET",
    type: "secret_text",
  });
}

async function putScriptContent(cloudflareJson, accountId, scriptName, readFileFn) {
  const main = await readFileFn(path.join(DIST_DIR, MAIN_MODULE));
  const sourceMap = await readOptionalFile(readFileFn, path.join(DIST_DIR, SOURCE_MAP));
  const metadata = { main_module: MAIN_MODULE };
  const form = new FormData();

  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    "metadata.json",
  );
  form.append(
    MAIN_MODULE,
    new Blob([main], { type: "application/javascript+module" }),
    MAIN_MODULE,
  );

  if (sourceMap) {
    form.append(SOURCE_MAP, new Blob([sourceMap], { type: "application/source-map" }), SOURCE_MAP);
  }

  await cloudflareJson("PUT", `/accounts/${accountId}/workers/scripts/${scriptName}/content`, {
    body: form,
  });
}

function assertObservability(actual, expected) {
  if (!expected) {
    return;
  }
  if (actual?.enabled !== expected.enabled) {
    throw new Error("Refusing content-only deploy: deployed observability.enabled drifted.");
  }
  assertNestedObservability(actual?.logs, expected.logs, "observability.logs");
  assertNestedObservability(actual?.traces, expected.traces, "observability.traces");
}

function assertNestedObservability(actual, expected, label) {
  if (!expected) {
    return;
  }
  if (actual?.enabled !== expected.enabled) {
    throw new Error(`Refusing content-only deploy: deployed ${label}.enabled drifted.`);
  }
  assertSetEqual(actual?.destinations ?? [], expected.destinations ?? [], `${label}.destinations`);
}

function assertBinding(bindings, expected) {
  const binding = bindings.find((candidate) => candidate.name === expected.name);
  if (!binding) {
    throw new Error(`Refusing content-only deploy: deployed Worker is missing ${expected.name}.`);
  }
  for (const [key, value] of Object.entries(expected)) {
    if (binding[key] !== value) {
      throw new Error(
        `Refusing content-only deploy: deployed ${expected.name}.${key} does not match deploy config.`,
      );
    }
  }
}

function assertSetEqual(actual, expected, label) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = [...expectedSet].filter((value) => !actualSet.has(value));
  const extra = [...actualSet].filter((value) => !expectedSet.has(value));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Refusing content-only deploy: deployed ${label} drifted. Missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}.`,
    );
  }
}

function only(values, label) {
  if (!Array.isArray(values) || values.length !== 1) {
    throw new Error(`Expected exactly one ${label} entry in ${WRANGLER_PATH}.`);
  }
  return values[0];
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected ${label} to be a non-empty string.`);
  }
  return value;
}

function requireEnv(name, env) {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

async function readOptionalFile(readFileFn, filePath) {
  try {
    return await readFileFn(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}
