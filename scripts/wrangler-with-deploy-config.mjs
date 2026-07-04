#!/usr/bin/env node
import path from "node:path";

import {
  getWranglerEnvName,
  hasWranglerConfigArg,
  isFlattenedGeneratedWranglerConfig,
  loadDeployWranglerConfig,
  parseConfigCommandArgs,
  runWrangler,
  stripWranglerEnvArgs,
  withTempWranglerConfig,
} from "./wrangler-deploy-config.mjs";

const { configArg, commandArgs } = parseConfigCommandArgs(process.argv.slice(2));
const wranglerArgs = commandArgs.filter((arg) => arg !== "--");

if (!configArg || wranglerArgs.length === 0) {
  fail("Usage: node scripts/wrangler-with-deploy-config.mjs <wrangler-config> -- <wrangler args>");
}

if (hasWranglerConfigArg(wranglerArgs)) {
  fail("Pass the source Wrangler config as the first argument, not through --config/-c.");
}

const sourcePath = path.resolve(process.cwd(), configArg);
const wranglerEnv = getWranglerEnvName(wranglerArgs);
const { config, sourceDir } = await loadDeployWranglerConfig(sourcePath, { wranglerEnv });
const deployArgs = isFlattenedGeneratedWranglerConfig(config, wranglerEnv)
  ? stripWranglerEnvArgs(wranglerArgs)
  : wranglerArgs;
await withTempWranglerConfig("insecur-wrangler-config-", config, sourceDir, async (configPath) =>
  runWrangler(insertConfigArg(deployArgs, configPath)),
);

function insertConfigArg(args, configPath) {
  return [args[0], "--config", configPath, ...args.slice(1)];
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
