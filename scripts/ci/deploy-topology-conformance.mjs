#!/usr/bin/env node
// Deploy-topology conformance gate (INS-199, ADR-0051/0064/0077). Structurally enforces that the
// monolith cannot regrow: capability isolation is a property of the deploy graph, not a code
// conditional, so it is asserted here against the checked-in wrangler configs and composition roots.
//
// Asserts:
//   (a) exactly ONE deploy declares the INSTANCE_ROOT_KEY_V1 binding, and it is `insecur-runtime`.
//   (b) the Runtime Worker mounts ZERO public routes and declares ZERO public hostname exposure.
//   (c) NO deploy declares BOTH public exposure AND the root-key binding (the monolith signature).
//   (d) NO V1 deploy carries a Service Access token audience or a reveal/value/delivery/approval
//       scope (ADR-0019 negative assertion; Service Access is deferred and unbuilt).
//   (e) the API Worker has exactly the intended private Runtime Service Binding shape.
//   (e2) the API Worker declares pre-tenant public-edge rate-limit bindings at top-level and under
//        env.preview with distinct namespace IDs (INS-278).
//   (f) each deploy's live public route mounts match docs/specs/deploy-route-inventory.md in both
//       directions (ADR-0067).
//   (g) signing secrets are never declared as plaintext wrangler `vars` (INS-276).
//
// HARD-FAILS (exit 1) on any violation. Wired into `pnpm verify`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseJsonc } from "../jsonc.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const appsDir = join(repoRoot, "apps");
const ROOT_KEY_BINDING = "INSTANCE_ROOT_KEY_V1";
const API_SCRIPT_NAME = "insecur-api";
const WEB_SCRIPT_NAME = "insecur-web";
const API_BINDING = "API";
const RUNTIME_BINDING = "RUNTIME";
const RUNTIME_SCRIPT_NAME = "insecur-runtime";
const RUNTIME_ENTRYPOINT = "RuntimeService";
const INVENTORY_DOC = join(repoRoot, "docs", "specs", "deploy-route-inventory.md");
// INS-278: pre-tenant public-edge abuse controls on @insecur/api (production + preview deploys).
const PUBLIC_EDGE_RATE_LIMIT_BINDINGS = [
  { name: "ONBOARDING_IP", limit: 30, period: 60 },
  { name: "ONBOARDING_ACTOR", limit: 10, period: 60 },
  { name: "BOOTSTRAP_IP", limit: 10, period: 60 },
  { name: "BOOTSTRAP_ACTOR", limit: 5, period: 60 },
  { name: "AUTH_EXCHANGE_IP", limit: 20, period: 60 },
];

// ADR-0019: Service Access is deferred and must never be expressed by a V1 deploy. These tokens in a
// wrangler config (e.g. a token-audience var or a reveal scope binding) signal the boundary leaking.
const SERVICE_ACCESS_TOKENS = [
  "service-access",
  "service_access",
  "insecur-service-access",
  "reveal",
  ":value",
  "delivery_approval",
  "approval_grant",
];

// INS-276: hop-token and session signing keys must be encrypted Worker secrets or Secrets Store
// bindings — never plaintext wrangler `vars` visible in the dashboard.
const PLAINTEXT_FORBIDDEN_VARS = ["RUNTIME_TOKEN_SIGNING_SECRET", "SESSION_SIGNING_SECRET"];

const failures = [];
const fail = (message) => failures.push(message);

main();

function main() {
  const deploys = discoverDeploys();
  if (deploys.length === 0) {
    fail("no apps/*/wrangler.jsonc deploys found");
    report();
  }

  assertSingleRootKeyHolder(deploys);
  assertRuntimeHasNoPublicRoutes(deploys);
  assertNoMonolith(deploys);
  assertNoServiceAccessSurface(deploys);
  assertApiRuntimeServiceBinding(deploys);
  assertWebApiServiceBinding(deploys);
  assertApiPublicEdgeRateLimitBindings(deploys);
  assertRouteInventoryMatches(deploys);
  assertNoPlaintextSigningSecretsInVars(deploys);

  report();
}

function report() {
  if (failures.length > 0) {
    process.stderr.write("deploy-topology conformance FAILED:\n");
    for (const message of failures) {
      process.stderr.write(`  ::error::${message}\n`);
    }
    process.exit(1);
  }
  process.stdout.write("deploy-topology conformance OK\n");
  process.exit(0);
}

function discoverDeploys() {
  const deploys = [];
  for (const entry of readdirSync(appsDir)) {
    const appPath = join(appsDir, entry);
    const wranglerPath = join(appPath, "wrangler.jsonc");
    if (!isFile(wranglerPath)) {
      continue;
    }
    const raw = readFileSync(wranglerPath, "utf8");
    let config;
    try {
      config = parseJsonc(raw, wranglerPath);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
      continue;
    }
    const rootKeyScopes = findRootKeyScopes(config);
    const publicHostnameExposures = findPublicHostnameExposures(config);
    deploys.push({
      app: entry,
      name: typeof config.name === "string" ? config.name : entry,
      config,
      wranglerPath,
      raw,
      rootKeyScopes,
      hasRootKey: rootKeyScopes.length > 0,
      publicHostnameExposures,
      routes: [
        ...extractPublicRoutes(join(appPath, "src", "index.ts")),
        ...extractTanStackFileRoutes(appPath),
      ].sort(),
    });
  }
  return deploys;
}

function findRootKeyScopes(config) {
  const scopes = [];
  if (declaresRootKey(config)) {
    scopes.push("top-level");
  }
  if (config && typeof config === "object" && config.env && typeof config.env === "object") {
    for (const [envName, envConfig] of Object.entries(config.env)) {
      if (declaresRootKey(envConfig)) {
        scopes.push(`env.${envName}`);
      }
    }
  }
  return scopes;
}

function declaresRootKey(config) {
  if (!config || typeof config !== "object") {
    return false;
  }
  const secrets = config.secrets_store_secrets;
  if (!Array.isArray(secrets)) {
    return false;
  }
  return secrets.some((secret) => secret?.binding === ROOT_KEY_BINDING);
}

function findPublicHostnameExposures(config) {
  const exposures = [];
  collectPublicHostnameExposures(exposures, "top-level", config);
  if (config && typeof config === "object" && config.env && typeof config.env === "object") {
    for (const [envName, envConfig] of Object.entries(config.env)) {
      collectPublicHostnameExposures(exposures, `env.${envName}`, envConfig);
    }
  }
  return exposures;
}

function collectPublicHostnameExposures(exposures, scope, config) {
  if (!config || typeof config !== "object") {
    return;
  }
  if (isConfiguredPublicHostname(config.route)) {
    exposures.push(`${scope}.route`);
  }
  if (
    Array.isArray(config.routes) &&
    config.routes.some((route) => isConfiguredPublicHostname(route))
  ) {
    exposures.push(`${scope}.routes`);
  }
  if (isConfiguredPublicHostname(config.custom_domain)) {
    exposures.push(`${scope}.custom_domain`);
  }
  if (config.workers_dev === true) {
    exposures.push(`${scope}.workers_dev`);
  } else if (config.workers_dev !== false && !hasConfiguredPublicHostname(config)) {
    exposures.push(`${scope}.workers_dev(default)`);
  }
}

function hasConfiguredPublicHostname(config) {
  return (
    isConfiguredPublicHostname(config.route) ||
    (Array.isArray(config.routes) &&
      config.routes.some((route) => isConfiguredPublicHostname(route))) ||
    isConfiguredPublicHostname(config.custom_domain)
  );
}

function isConfiguredPublicHostname(value) {
  if (value === undefined || value === null || value === false) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.some((item) => isConfiguredPublicHostname(item));
  }
  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return Boolean(value);
}

// Extract public mount prefixes from a Hono composition root by reading its `app.route(...)`,
// `app.<method>(...)`, `app.on(...)`, `app.mount(...)`, and public-surface `app.use(...)` calls.
function extractPublicRoutes(indexPath) {
  if (!isFile(indexPath)) {
    return [];
  }
  const source = readFileSync(indexPath, "utf8");
  const mounts = new Set();
  const patterns = [
    /app\.(route|all|get|post|put|delete|patch|options|head|mount|use)\(\s*["'`]([^"'`]+)["'`]/g,
    /app\.on\(\s*(?:\[[^\)]*?\]|["'`][^"'`]+["'`])\s*,\s*["'`]([^"'`]+)["'`]/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const callName = match[2] === undefined ? undefined : match[1];
      if (callName === "use" && isSentryMiddlewareUse(source, match.index)) {
        continue;
      }
      const prefix = match[2] ?? match[1];
      if (isPublicMount(prefix)) {
        mounts.add(prefix);
      }
    }
  }
  const onPathArrayPattern = /app\.on\(\s*(?:\[[^\)]*?\]|["'`][^"'`]+["'`])\s*,\s*\[([^\]]*)\]/g;
  let arrayMatch;
  while ((arrayMatch = onPathArrayPattern.exec(source)) !== null) {
    const paths = arrayMatch[1];
    for (const pathMatch of paths.matchAll(/["'`]([^"'`]+)["'`]/g)) {
      const prefix = pathMatch[1];
      if (isPublicMount(prefix)) {
        mounts.add(prefix);
      }
    }
  }
  const pathOmittedUsePattern = /app\.use\(\s*(?!["'`])/g;
  let useMatch;
  while ((useMatch = pathOmittedUsePattern.exec(source)) !== null) {
    if (!isSentryMiddlewareUse(source, useMatch.index)) {
      mounts.add("*");
    }
  }
  if (/pathname\s*===\s*["'`]\/healthz["'`]/.test(source)) {
    mounts.add("/healthz");
  }
  return [...mounts].sort();
}

function isSentryMiddlewareUse(source, callIndex) {
  const snippet = source.slice(callIndex, callIndex + 160);
  return (
    /^app\.use\(\s*sentry\(/.test(snippet) ||
    /^app\.use\(\s*["'`][^"'`]+["'`]\s*,\s*sentry\(/.test(snippet)
  );
}

function isPublicMount(prefix) {
  return prefix === "*" || prefix.startsWith("/");
}

function assertSingleRootKeyHolder(deploys) {
  const holders = deploys.filter((deploy) => deploy.hasRootKey);
  if (holders.length === 0) {
    fail(`no deploy declares the ${ROOT_KEY_BINDING} binding (expected exactly one)`);
    return;
  }
  if (holders.length > 1) {
    const names = holders.map((deploy) => deploy.name).join(", ");
    fail(`${holders.length} deploys declare ${ROOT_KEY_BINDING} (expected exactly one): ${names}`);
  }
  for (const holder of holders) {
    if (holder.name !== RUNTIME_SCRIPT_NAME) {
      fail(
        `${ROOT_KEY_BINDING} is declared by '${holder.name}' (${holder.rootKeyScopes.join(", ")}) but only '${RUNTIME_SCRIPT_NAME}' may hold it`,
      );
    }
  }
}

function assertRuntimeHasNoPublicRoutes(deploys) {
  for (const deploy of deploys) {
    if (deploy.name === RUNTIME_SCRIPT_NAME && publicExposureSummary(deploy).length > 0) {
      fail(
        `${RUNTIME_SCRIPT_NAME} must serve zero public routes or hostname exposure but declares: ${publicExposureSummary(deploy).join(", ")}`,
      );
    }
  }
}

function assertNoMonolith(deploys) {
  for (const deploy of deploys) {
    if (deploy.hasRootKey && publicExposureSummary(deploy).length > 0) {
      fail(
        `MONOLITH: deploy '${deploy.name}' declares both the root-key binding and public exposure (${publicExposureSummary(deploy).join(", ")})`,
      );
    }
  }
}

function publicExposureSummary(deploy) {
  return [
    ...deploy.routes.map((route) => `source route ${route}`),
    ...deploy.publicHostnameExposures.map((exposure) => `wrangler ${exposure}`),
  ];
}

function assertNoServiceAccessSurface(deploys) {
  for (const deploy of deploys) {
    const haystack = deploy.raw.toLowerCase();
    for (const token of SERVICE_ACCESS_TOKENS) {
      if (haystack.includes(token)) {
        fail(
          `deploy '${deploy.name}' wrangler config references Service Access token '${token}' (ADR-0019: deferred, must not appear in a V1 deploy)`,
        );
      }
    }
  }
}

function extractTanStackFileRoutes(appPath) {
  const routesDir = join(appPath, "src", "routes");
  if (!isDirectory(routesDir)) {
    return [];
  }
  const mounts = new Set();
  for (const entry of readdirSync(routesDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".tsx")) {
      continue;
    }
    const source = readFileSync(join(routesDir, entry.name), "utf8");
    for (const match of source.matchAll(/createFileRoute\(\s*["'`]([^"'`]+)["'`]/g)) {
      const route = match[1];
      if (isPublicMount(route)) {
        mounts.add(route);
      }
    }
  }
  return [...mounts];
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function assertWebApiServiceBinding(deploys) {
  const webDeploy = deploys.find((deploy) => deploy.name === WEB_SCRIPT_NAME);
  if (!webDeploy) {
    fail(`missing Web BFF deploy '${WEB_SCRIPT_NAME}'`);
    return;
  }
  assertApiBindingShape(webDeploy, webDeploy.config, {
    scope: "top-level",
    expectedService: API_SCRIPT_NAME,
  });

  const previewConfig = webDeploy.config?.env?.preview;
  if (!previewConfig || typeof previewConfig !== "object") {
    fail(
      `deploy '${WEB_SCRIPT_NAME}' env.preview is missing the ${API_BINDING} Service Binding override`,
    );
    return;
  }
  assertApiBindingShape(webDeploy, previewConfig, {
    scope: "env.preview",
    expectedService: `${API_SCRIPT_NAME}-preview`,
  });
}

function assertApiBindingShape(deploy, config, { scope, expectedService }) {
  const services = config?.services;
  if (!Array.isArray(services)) {
    fail(
      `deploy '${deploy.name}' ${scope} must declare a private ${API_BINDING} Service Binding to '${expectedService}'`,
    );
    return;
  }
  const binding = services.find((service) => service?.binding === API_BINDING);
  if (!binding) {
    fail(`deploy '${deploy.name}' ${scope} is missing the ${API_BINDING} Service Binding`);
    return;
  }
  if (binding.service !== expectedService) {
    fail(
      `deploy '${deploy.name}' ${scope} ${API_BINDING} Service Binding targets '${String(binding.service)}' (expected '${expectedService}')`,
    );
  }
  if (binding.entrypoint !== undefined) {
    fail(
      `deploy '${deploy.name}' ${scope} ${API_BINDING} Service Binding must not declare an entrypoint (fetch hop to insecur-api)`,
    );
  }
}

function assertApiRuntimeServiceBinding(deploys) {
  const apiDeploy = deploys.find((deploy) => deploy.name === API_SCRIPT_NAME);
  if (!apiDeploy) {
    fail(`missing API deploy '${API_SCRIPT_NAME}'`);
    return;
  }
  assertRuntimeBindingShape(apiDeploy, apiDeploy.config, {
    scope: "top-level",
    expectedService: RUNTIME_SCRIPT_NAME,
  });

  const previewConfig = apiDeploy.config?.env?.preview;
  if (!previewConfig || typeof previewConfig !== "object") {
    fail(
      `deploy '${API_SCRIPT_NAME}' env.preview is missing the ${RUNTIME_BINDING} Service Binding override`,
    );
    return;
  }
  assertRuntimeBindingShape(apiDeploy, previewConfig, {
    scope: "env.preview",
    expectedService: `${RUNTIME_SCRIPT_NAME}-preview`,
  });
}

function assertApiPublicEdgeRateLimitBindings(deploys) {
  const apiDeploy = deploys.find((deploy) => deploy.name === API_SCRIPT_NAME);
  if (!apiDeploy) {
    fail(`missing API deploy '${API_SCRIPT_NAME}'`);
    return;
  }

  const topLevelByName = assertPublicEdgeRateLimitScope(apiDeploy, apiDeploy.config, "top-level");
  if (!topLevelByName) {
    return;
  }

  const previewConfig = apiDeploy.config?.env?.preview;
  if (!previewConfig || typeof previewConfig !== "object") {
    fail(
      `deploy '${API_SCRIPT_NAME}' env.preview is missing pre-tenant public-edge rate-limit bindings (INS-278)`,
    );
    return;
  }

  const previewByName = assertPublicEdgeRateLimitScope(apiDeploy, previewConfig, "env.preview");
  if (!previewByName) {
    return;
  }

  for (const expected of PUBLIC_EDGE_RATE_LIMIT_BINDINGS) {
    const topLevel = topLevelByName.get(expected.name);
    const preview = previewByName.get(expected.name);
    if (!topLevel || !preview) {
      continue;
    }
    if (topLevel.namespace_id === preview.namespace_id) {
      fail(
        `deploy '${API_SCRIPT_NAME}' env.preview rate-limit binding '${expected.name}' reuses namespace_id '${topLevel.namespace_id}' (preview must use a distinct namespace)`,
      );
    }
  }
}

function assertPublicEdgeRateLimitScope(deploy, config, scope) {
  const ratelimits = config?.ratelimits;
  if (!Array.isArray(ratelimits)) {
    fail(
      `deploy '${deploy.name}' ${scope} must declare pre-tenant public-edge rate-limit bindings (INS-278)`,
    );
    return null;
  }

  const byName = new Map();
  const namespaceIds = new Set();
  for (const binding of ratelimits) {
    const name = binding?.name;
    if (typeof name !== "string") {
      fail(`deploy '${deploy.name}' ${scope} rate-limit binding is missing a name`);
      continue;
    }
    if (byName.has(name)) {
      fail(`deploy '${deploy.name}' ${scope} declares duplicate rate-limit binding '${name}'`);
    }
    byName.set(name, binding);

    const namespaceId = binding?.namespace_id;
    if (typeof namespaceId !== "string" || namespaceId.length === 0) {
      fail(`deploy '${deploy.name}' ${scope} rate-limit binding '${name}' is missing namespace_id`);
      continue;
    }
    if (namespaceIds.has(namespaceId)) {
      fail(`deploy '${deploy.name}' ${scope} reuses rate-limit namespace_id '${namespaceId}'`);
    }
    namespaceIds.add(namespaceId);
  }

  for (const expected of PUBLIC_EDGE_RATE_LIMIT_BINDINGS) {
    const binding = byName.get(expected.name);
    if (!binding) {
      fail(
        `deploy '${deploy.name}' ${scope} is missing rate-limit binding '${expected.name}' (INS-278)`,
      );
      continue;
    }
    const simple = binding.simple;
    if (!simple || typeof simple !== "object") {
      fail(
        `deploy '${deploy.name}' ${scope} rate-limit binding '${expected.name}' is missing simple limit config`,
      );
      continue;
    }
    if (simple.limit !== expected.limit || simple.period !== expected.period) {
      fail(
        `deploy '${deploy.name}' ${scope} rate-limit binding '${expected.name}' has limit ${simple.limit}/${simple.period} (expected ${expected.limit}/${expected.period})`,
      );
    }
  }

  return byName;
}

function assertRuntimeBindingShape(deploy, config, { scope, expectedService }) {
  const services = config?.services;
  if (!Array.isArray(services)) {
    fail(
      `deploy '${deploy.name}' ${scope} must declare exactly one ${RUNTIME_BINDING} Service Binding`,
    );
    return;
  }
  if (services.length !== 1) {
    fail(
      `deploy '${deploy.name}' ${scope} declares ${services.length} Service Bindings (expected exactly one ${RUNTIME_BINDING} binding)`,
    );
    return;
  }
  const [binding] = services;
  const actual = {
    binding: binding?.binding,
    service: binding?.service,
    entrypoint: binding?.entrypoint,
  };
  const expected = {
    binding: RUNTIME_BINDING,
    service: expectedService,
    entrypoint: RUNTIME_ENTRYPOINT,
  };
  for (const key of Object.keys(expected)) {
    if (actual[key] !== expected[key]) {
      fail(
        `deploy '${deploy.name}' ${scope} ${RUNTIME_BINDING} Service Binding has ${key} '${String(actual[key])}' (expected '${expected[key]}')`,
      );
    }
  }
}

function assertRouteInventoryMatches(deploys) {
  if (!isFile(INVENTORY_DOC)) {
    fail(`route inventory owner doc is missing: ${INVENTORY_DOC}`);
    return;
  }
  const doc = readFileSync(INVENTORY_DOC, "utf8");
  const documentedByDeploy = parseRouteInventory(doc);
  for (const deploy of deploys) {
    const documented = documentedByDeploy.get(deploy.name) ?? new Set();
    for (const route of deploy.routes) {
      if (!documented.has(route)) {
        fail(
          `route '${route}' on deploy '${deploy.name}' is not documented for that deploy in ${INVENTORY_DOC} (ADR-0067: declare it there or move it off this deploy)`,
        );
      }
    }
    for (const route of documented) {
      if (!deploy.routes.includes(route)) {
        fail(
          `route '${route}' is documented for deploy '${deploy.name}' in ${INVENTORY_DOC} but is not mounted by that deploy`,
        );
      }
    }
  }
}

function assertNoPlaintextSigningSecretsInVars(deploys) {
  for (const deploy of deploys) {
    for (const { scope, config } of collectConfigScopes(deploy.config)) {
      const vars = config?.vars;
      if (!vars || typeof vars !== "object") {
        continue;
      }
      for (const key of PLAINTEXT_FORBIDDEN_VARS) {
        if (Object.prototype.hasOwnProperty.call(vars, key)) {
          fail(
            `deploy '${deploy.name}' ${scope} declares ${key} as a plaintext wrangler var; use wrangler secret put or Secrets Store (INS-276)`,
          );
        }
      }
    }
  }
}

function collectConfigScopes(config) {
  const scopes = [{ scope: "top-level", config }];
  if (config && typeof config === "object" && config.env && typeof config.env === "object") {
    for (const [envName, envConfig] of Object.entries(config.env)) {
      scopes.push({ scope: `env.${envName}`, config: envConfig });
    }
  }
  return scopes;
}

function parseRouteInventory(doc) {
  const documentedByDeploy = new Map();
  const headingPattern = /^## .+$/gm;
  const headings = [...doc.matchAll(headingPattern)];
  for (const [index, heading] of headings.entries()) {
    const title = heading[0];
    const backticked = [...title.matchAll(/`([^`]+)`/g)];
    const deployName = backticked.at(-1)?.[1];
    if (!deployName) {
      continue;
    }
    const bodyStart = heading.index + title.length;
    const bodyEnd = headings[index + 1]?.index ?? doc.length;
    const body = doc.slice(bodyStart, bodyEnd);
    const routes = [...body.matchAll(/^\|\s*[^|]+\|\s*`(\/[^`]*)`\s*\|/gm)].map(
      (match) => match[1],
    );
    documentedByDeploy.set(deployName, new Set(routes.sort()));
  }
  return documentedByDeploy;
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
