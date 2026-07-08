#!/usr/bin/env node
// Generate docs/specs/deploy-route-inventory.md from live route mounts plus the hand-edited
// sidecar (deploy-route-inventory.sidecar.json). Run via `pnpm routes:inventory`.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

import { collectDeployRouteEntries, listWranglerApps } from "./ci/deploy-routes.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const appsDir = join(repoRoot, "apps");
const sidecarPath = join(repoRoot, "docs", "specs", "deploy-route-inventory.sidecar.json");
const inventoryPath = join(repoRoot, "docs", "specs", "deploy-route-inventory.md");

const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8"));
const prettierConfigPromise = prettier.resolveConfig(inventoryPath);

export async function generateDeployRouteInventory() {
  const prettierConfig = await prettierConfigPromise;
  return prettier.format(generateInventoryMarkdown(sidecar, discoverRoutesByDeploy()), {
    ...prettierConfig,
    filepath: inventoryPath,
  });
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCli) {
  const generated = await generateDeployRouteInventory();

  if (process.argv.includes("--check")) {
    const committed = readFileSync(inventoryPath, "utf8");
    if (committed !== generated) {
      process.stderr.write(
        "deploy-route-inventory.md is stale; run `pnpm routes:inventory` and commit the result\n",
      );
      process.exit(1);
    }
    process.stdout.write("deploy-route-inventory.md is up to date\n");
    process.exit(0);
  }

  writeFileSync(inventoryPath, generated);
  process.stdout.write(`Wrote ${inventoryPath}\n`);
}

function discoverRoutesByDeploy() {
  const routesByDeploy = new Map();
  for (const deploy of listWranglerApps(appsDir)) {
    routesByDeploy.set(deploy.name, collectDeployRouteEntries(deploy.appPath, deploy.app));
  }
  return routesByDeploy;
}

function generateInventoryMarkdown(sidecarDoc, routesByDeploy) {
  const lines = [
    "# Deploy route inventory (owner doc)",
    "",
    "<!-- GENERATED — do not hand-edit. Regenerate with `pnpm routes:inventory`. -->",
    "<!-- Human-readable deploy intros and route notes live in deploy-route-inventory.sidecar.json. -->",
    "",
    "This is the source of truth for which public HTTP route group lives on which Worker deploy",
    "(ADR-0067 single-statement rule). The deploy-topology conformance gate",
    "(`scripts/ci/deploy-topology-conformance.mjs`, INS-199) parses each `apps/*/src/index.ts` and",
    "**fails CI** when the live route mounts drift from this table. A route on the wrong deploy is a",
    "capability-isolation regression (ADR-0051/0064/0077), not a refactor — moving one here is a",
    "reviewer-visible decision.",
    "",
    "The format is exact: one row per `app.route(...)` / `app.<method>(...)` mount in the deploy's",
    "composition root, listing the mount prefix verbatim. `/healthz` is a per-deploy liveness handler and",
    "is expected on every deploy. The Runtime Worker MUST declare zero `/v1/*` routes — it is reachable",
    "only over the private Service Binding via the `RuntimeService` RPC entrypoint (ADR-0077).",
    "",
  ];

  for (const section of sidecarDoc.sections) {
    lines.push(`## ${section.heading}`, "");
    lines.push(section.intro, "");
    for (const paragraph of section.preTable ?? []) {
      lines.push(paragraph, "");
    }
    lines.push(renderRouteTable(section, routesByDeploy.get(section.deploy) ?? []));
    lines.push("");
    for (const paragraph of section.footnotes ?? []) {
      lines.push(paragraph, "");
    }
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

function renderRouteTable(section, discoveredRoutes) {
  const sidecarRoutes = section.routes ?? {};
  const rows = [];

  if (section.staticRows) {
    for (const row of section.staticRows) {
      rows.push({ method: row.method, mount: row.mount });
    }
  } else {
    for (const route of discoveredRoutes) {
      const override = sidecarRoutes[route.mount] ?? {};
      rows.push({
        method: override.method ?? route.method,
        mount: route.mount,
        auth: override.auth,
        notes: override.notes,
      });
    }
  }

  const includeAuth = rows.some((row) => row.auth);
  const includeNotes = rows.some((row) => row.notes);
  const header =
    includeAuth || includeNotes
      ? `| Method | Mount prefix |${includeAuth ? " Auth |" : ""}${includeNotes ? " Notes |" : ""}`
      : "| Method | Mount prefix |";
  const separator =
    includeAuth || includeNotes
      ? `| ------ | ------------------------------------------- |${includeAuth ? " ---- |" : ""}${includeNotes ? " ----- |" : ""}`
      : "| ------ | ------------------------------------------- |";

  const body = rows.map((row) => {
    let line = `| ${row.method} | \`${row.mount}\` |`;
    if (includeAuth) {
      line += ` ${row.auth ?? ""} |`;
    }
    if (includeNotes) {
      line += ` ${row.notes ?? ""} |`;
    }
    return line;
  });

  return [header, separator, ...body].join("\n");
}
