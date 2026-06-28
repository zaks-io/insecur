#!/usr/bin/env node
// Deploy-topology conformance gate (INS-199, ADR-0051/0064/0077). Structurally enforces that the
// monolith cannot regrow: capability isolation is a property of the deploy graph, not a code
// conditional, so it is asserted here against the checked-in wrangler configs and composition roots.
//
// Asserts:
//   (a) exactly ONE deploy declares the INSTANCE_ROOT_KEY_V1 binding, and it is `insecur-runtime`.
//   (b) the Runtime Worker mounts ZERO public routes.
//   (c) NO deploy declares BOTH a public route group AND the root-key binding (the monolith
//       signature).
//   (d) NO V1 deploy carries a Service Access token audience or a reveal/value/delivery/approval
//       scope (ADR-0019 negative assertion; Service Access is deferred and unbuilt).
//   (e) the API Worker has exactly the intended private Runtime Service Binding shape.
//   (f) each deploy's live public route mounts match docs/specs/deploy-route-inventory.md in both
//       directions (ADR-0067).
//
// HARD-FAILS (exit 1) on any violation. Wired into `pnpm verify`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const appsDir = join(repoRoot, "apps");
const ROOT_KEY_BINDING = "INSTANCE_ROOT_KEY_V1";
const API_SCRIPT_NAME = "insecur-api";
const RUNTIME_BINDING = "RUNTIME";
const RUNTIME_SCRIPT_NAME = "insecur-runtime";
const RUNTIME_ENTRYPOINT = "RuntimeService";
const INVENTORY_DOC = join(repoRoot, "docs", "specs", "deploy-route-inventory.md");

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
  assertRouteInventoryMatches(deploys);

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
    const config = parseJsonc(raw, wranglerPath);
    const rootKeyScopes = findRootKeyScopes(config);
    deploys.push({
      app: entry,
      name: typeof config.name === "string" ? config.name : entry,
      config,
      wranglerPath,
      raw,
      rootKeyScopes,
      hasRootKey: rootKeyScopes.length > 0,
      routes: extractPublicRoutes(join(appPath, "src", "index.ts")),
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

// Extract public mount prefixes from a Hono composition root by reading its `app.route(...)`,
// `app.<method>(...)`, `app.on(...)`, `app.mount(...)`, and `app.use(...)` calls. This is the live
// route inventory the deploy actually serves.
function extractPublicRoutes(indexPath) {
  if (!isFile(indexPath)) {
    return [];
  }
  const source = readFileSync(indexPath, "utf8");
  const mounts = new Set();
  const patterns = [
    /app\.(?:route|all|get|post|put|delete|patch|options|head|mount|use)\(\s*["'`]([^"'`]+)["'`]/g,
    /app\.on\(\s*(?:\[[^\)]*?\]|["'`][^"'`]+["'`])\s*,\s*["'`]([^"'`]+)["'`]/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const prefix = match[1];
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
  if (pathOmittedUsePattern.test(source)) {
    mounts.add("*");
  }
  return [...mounts].sort();
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
    if (deploy.name === RUNTIME_SCRIPT_NAME && deploy.routes.length > 0) {
      fail(
        `${RUNTIME_SCRIPT_NAME} must serve zero public routes but mounts: ${deploy.routes.join(", ")}`,
      );
    }
  }
}

function assertNoMonolith(deploys) {
  for (const deploy of deploys) {
    if (deploy.hasRootKey && deploy.routes.length > 0) {
      fail(
        `MONOLITH: deploy '${deploy.name}' declares both the root-key binding and public routes (${deploy.routes.join(", ")})`,
      );
    }
  }
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
    const routes = [...body.matchAll(/^\|\s*[^|]+\|\s*`(\/[^`]+)`\s*\|/gm)].map(
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

// Minimal JSONC reader: strips // line comments and trailing commas. Sufficient for wrangler configs,
// which use no block comments and no string literals containing `//` (URLs would break this; none here).
function parseJsonc(text, path) {
  const withoutComments = text
    .split("\n")
    .map((line) => stripLineComment(line))
    .join("\n");
  const withoutTrailingCommas = withoutComments.replace(/,(\s*[}\]])/g, "$1");
  try {
    return JSON.parse(withoutTrailingCommas);
  } catch (error) {
    fail(`failed to parse ${path}: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

function stripLineComment(line) {
  let inString = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i - 1] !== "\\") {
      inString = !inString;
    }
    if (!inString && char === "/" && line[i + 1] === "/") {
      return line.slice(0, i);
    }
  }
  return line;
}
