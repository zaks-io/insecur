#!/usr/bin/env node
// Deploy-topology conformance gate (INS-199, ADR-0051/0064/0077). Structurally enforces that the
// monolith cannot regrow: capability isolation is a property of the deploy graph, not a code
// conditional, so it is asserted here against the checked-in wrangler configs and composition roots.
//
// Asserts:
//   (a) exactly ONE deploy declares the INSTANCE_ROOT_KEY_V1 binding, and it is `insecur-runtime`.
//   (b) the Runtime Worker mounts ZERO public /v1/* routes.
//   (c) NO deploy declares BOTH a public /v1/* route group AND the root-key binding (the monolith
//       signature).
//   (d) NO V1 deploy carries a Service Access token audience or a reveal/value/delivery/approval
//       scope (ADR-0019 negative assertion; Service Access is deferred and unbuilt).
//   (e) each deploy's live /v1/* route mounts match docs/specs/deploy-route-inventory.md (ADR-0067).
//
// HARD-FAILS (exit 1) on any violation. Wired into `pnpm verify`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const appsDir = join(repoRoot, "apps");
const ROOT_KEY_BINDING = "INSTANCE_ROOT_KEY_V1";
const RUNTIME_SCRIPT_NAME = "insecur-runtime";
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
    const config = parseJsonc(readFileSync(wranglerPath, "utf8"), wranglerPath);
    deploys.push({
      app: entry,
      name: typeof config.name === "string" ? config.name : entry,
      wranglerPath,
      raw: readFileSync(wranglerPath, "utf8"),
      hasRootKey: declaresRootKey(config),
      routes: extractV1Routes(join(appPath, "src", "index.ts")),
    });
  }
  return deploys;
}

function declaresRootKey(config) {
  const secrets = config.secrets_store_secrets;
  if (!Array.isArray(secrets)) {
    return false;
  }
  return secrets.some((secret) => secret?.binding === ROOT_KEY_BINDING);
}

// Extract the /v1/* mount prefixes from a Hono composition root by reading its `app.route(...)` /
// `app.<method>(...)` calls. This is the live route inventory the deploy actually serves.
function extractV1Routes(indexPath) {
  if (!isFile(indexPath)) {
    return [];
  }
  const source = readFileSync(indexPath, "utf8");
  const mounts = [];
  const pattern = /app\.(?:route|get|post|put|delete|patch)\(\s*["'`]([^"'`]+)["'`]/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const prefix = match[1];
    if (prefix.startsWith("/v1/")) {
      mounts.push(prefix);
    }
  }
  return mounts.sort();
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
        `${ROOT_KEY_BINDING} is declared by '${holder.name}' but only '${RUNTIME_SCRIPT_NAME}' may hold it`,
      );
    }
  }
}

function assertRuntimeHasNoPublicRoutes(deploys) {
  for (const deploy of deploys) {
    if (deploy.name === RUNTIME_SCRIPT_NAME && deploy.routes.length > 0) {
      fail(
        `${RUNTIME_SCRIPT_NAME} must serve zero public /v1/* routes but mounts: ${deploy.routes.join(", ")}`,
      );
    }
  }
}

function assertNoMonolith(deploys) {
  for (const deploy of deploys) {
    if (deploy.hasRootKey && deploy.routes.length > 0) {
      fail(
        `MONOLITH: deploy '${deploy.name}' declares both the root-key binding and public /v1/* routes (${deploy.routes.join(", ")})`,
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

function assertRouteInventoryMatches(deploys) {
  if (!isFile(INVENTORY_DOC)) {
    fail(`route inventory owner doc is missing: ${INVENTORY_DOC}`);
    return;
  }
  const doc = readFileSync(INVENTORY_DOC, "utf8");
  const documented = new Set([...doc.matchAll(/`(\/v1\/[^`]+)`/g)].map((match) => match[1]).sort());
  for (const deploy of deploys) {
    for (const route of deploy.routes) {
      if (!documented.has(route)) {
        fail(
          `route '${route}' on deploy '${deploy.name}' is not in ${INVENTORY_DOC} (ADR-0067: declare it there or move it off this deploy)`,
        );
      }
    }
  }
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
