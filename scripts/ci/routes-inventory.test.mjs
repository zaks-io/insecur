import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  collectDeployRouteEntries,
  collectDeployRouteMounts,
  parseRouteInventory,
} from "./deploy-routes.mjs";
import { generateDeployRouteInventory } from "../routes-inventory.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const inventoryPath = join(repoRoot, "docs", "specs", "deploy-route-inventory.md");

test("collectDeployRouteMounts discovers API and web product routes", () => {
  const apiRoutes = collectDeployRouteMounts(join(repoRoot, "apps", "api"), "api");
  assert.equal(apiRoutes.includes("*"), false);
  assert.ok(apiRoutes.includes("/healthz"));
  assert.ok(apiRoutes.includes("/v1/session"));
  assert.ok(apiRoutes.includes("/v1/orgs/:organizationId/webhook-subscriptions"));

  const webRoutes = collectDeployRouteMounts(join(repoRoot, "apps", "web"), "web");
  assert.ok(webRoutes.includes("/healthz"));
  assert.ok(webRoutes.includes("/orgs/$orgId/approvals/$id"));
  assert.ok(webRoutes.includes("/logout"));

  const siteRoutes = collectDeployRouteMounts(join(repoRoot, "apps", "site"), "site");
  assert.ok(siteRoutes.includes("/"));
  assert.ok(siteRoutes.includes("/.well-known/insecur/audit-export-signing-keys.json"));
});

test("collectDeployRouteEntries infers GET-only and multi-method API mounts", () => {
  const apiRoutes = collectDeployRouteEntries(join(repoRoot, "apps", "api"), "api");
  const firstValue = apiRoutes.find((route) => route.mount.endsWith("/first-value-usage"));
  const auth = apiRoutes.find((route) => route.mount === "/v1/auth");
  assert.equal(firstValue?.method, "GET");
  assert.equal(auth?.method, "*");
});

test("collectDeployRouteEntries discovers site marketing root and login methods", () => {
  const siteRoutes = collectDeployRouteEntries(join(repoRoot, "apps", "site"), "site");
  const root = siteRoutes.find((route) => route.mount === "/");
  assert.equal(root?.method, "GET");

  const webRoutes = collectDeployRouteEntries(join(repoRoot, "apps", "web"), "web");
  const login = webRoutes.find((route) => route.mount === "/login");
  const logout = webRoutes.find((route) => route.mount === "/logout");
  assert.equal(login?.method, "*");
  assert.equal(logout?.method, "POST");
});

test("parseRouteInventory ignores runtime static rows without public mount prefixes", () => {
  const inventory = readFileSync(inventoryPath, "utf8");
  const documented = parseRouteInventory(inventory);
  assert.deepEqual([...documented.get("insecur-runtime")], []);
  assert.ok(documented.get("insecur-api")?.has("/v1/auth"));
});

test("generateDeployRouteInventory matches committed inventory", async () => {
  const committed = readFileSync(inventoryPath, "utf8");
  const generated = await generateDeployRouteInventory();
  assert.equal(generated, committed);
});

test("topology gate fails when generated inventory is stale", async () => {
  const committed = readFileSync(inventoryPath, "utf8");
  writeFileSync(inventoryPath, `${committed}\n`);
  try {
    const generated = await generateDeployRouteInventory();
    assert.notEqual(generated, `${committed}\n`);
  } finally {
    writeFileSync(inventoryPath, committed);
  }
});
