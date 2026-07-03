#!/usr/bin/env node
import path from "node:path";

import {
  getWranglerEnvName,
  loadDeployWranglerConfig,
  parseConfigCommandArgs,
  runWrangler,
  withTempWranglerConfig,
} from "./wrangler-deploy-config.mjs";

const { configArg, commandArgs } = parseConfigCommandArgs(process.argv.slice(2));
const wranglerArgs = commandArgs.filter((arg) => arg !== "--");

if (!configArg) {
  fail(
    "Usage: node scripts/deploy-route-preserving-worker.mjs <wrangler-config> -- [wrangler deploy args]",
  );
}

if (process.env.CLOUDFLARE_ENV && process.env.CLOUDFLARE_ENV !== "production") {
  fail("Route-preserving deploy is production-only. Use deploy:preview for preview.");
}

if (getWranglerEnvName(wranglerArgs)) {
  fail("Route-preserving deploy is production-only. Use deploy:preview for preview.");
}

const sourcePath = path.resolve(process.cwd(), configArg);
const { config, sourceDir } = await loadDeployWranglerConfig(sourcePath);
const workerName = assertString(config.name, "wrangler.name");
const routeCount = countRoutes(config);

delete config.routes;
delete config.domains;
delete config.$schema;
delete config.configPath;
delete config.userConfigPath;
delete config.topLevelName;
delete config.definedEnvironments;
delete config.legacy_env;
config.workers_dev ??= false;

await withTempWranglerConfig("insecur-route-preserving-", config, sourceDir, async (configPath) => {
  await runWrangler(["deploy", "--config", configPath, ...wranglerArgs], "wrangler deploy");
  console.log(`Deployed ${workerName} without changing ${routeCount} configured Workers route(s).`);
});

function countRoutes(config) {
  const routes = Array.isArray(config.routes) ? config.routes.length : 0;
  const domains = Array.isArray(config.domains) ? config.domains.length : 0;
  return routes + domains;
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected ${label} to be a non-empty string.`);
  }
  return value;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
