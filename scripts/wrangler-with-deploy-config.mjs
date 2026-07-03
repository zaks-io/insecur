#!/usr/bin/env node
import path from "node:path";

import {
  getWranglerEnvName,
  loadDeployWranglerConfig,
  parseConfigCommandArgs,
  runWrangler,
  withTempWranglerConfig,
} from "./wrangler-deploy-config.mjs";

const { configArg, commandArgs: wranglerArgs } = parseConfigCommandArgs(process.argv.slice(2));

if (!configArg || wranglerArgs.length === 0) {
  fail("Usage: node scripts/wrangler-with-deploy-config.mjs <wrangler-config> -- <wrangler args>");
}

if (wranglerArgs.some((arg) => arg === "--config" || arg.startsWith("--config="))) {
  fail("Pass the source Wrangler config as the first argument, not through --config.");
}

const sourcePath = path.resolve(process.cwd(), configArg);
const wranglerEnv = getWranglerEnvName(wranglerArgs);
const { config, sourceDir } = await loadDeployWranglerConfig(sourcePath, { wranglerEnv });
await withTempWranglerConfig("insecur-wrangler-config-", config, sourceDir, async (configPath) =>
  runWrangler(insertConfigArg(wranglerArgs, configPath)),
);

function insertConfigArg(args, configPath) {
  return [args[0], "--config", configPath, ...args.slice(1)];
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
