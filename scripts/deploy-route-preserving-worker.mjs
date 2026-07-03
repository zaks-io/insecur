#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseJsonc } from "./jsonc.mjs";

const args = process.argv.slice(2);
const delimiterIndex = args.indexOf("--");
const configArg = delimiterIndex === -1 ? args[0] : args.slice(0, delimiterIndex)[0];
const rawWranglerArgs = delimiterIndex === -1 ? args.slice(1) : args.slice(delimiterIndex + 1);
const wranglerArgs = rawWranglerArgs.filter((arg) => arg !== "--");

if (!configArg) {
  fail(
    "Usage: node scripts/deploy-route-preserving-worker.mjs <wrangler-config> -- [wrangler deploy args]",
  );
}

if (process.env.CLOUDFLARE_ENV && process.env.CLOUDFLARE_ENV !== "production") {
  fail("Route-preserving deploy is production-only. Use deploy:preview for preview.");
}

const sourcePath = path.resolve(process.cwd(), configArg);
const sourceDir = path.dirname(sourcePath);
const source = await readFile(sourcePath, "utf8");
const config = parseJsonc(source, sourcePath);
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

const tempDir = await mkdtemp(path.join(os.tmpdir(), "insecur-route-preserving-"));
const tempConfigPath = path.join(tempDir, "wrangler.json");

try {
  await writeFile(
    tempConfigPath,
    `${JSON.stringify(rebaseConfigPaths(config, sourceDir, tempDir), null, 2)}\n`,
  );

  await runWrangler(["deploy", "--config", tempConfigPath, ...wranglerArgs]);
  console.log(`Deployed ${workerName} without changing ${routeCount} configured Workers route(s).`);
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

function countRoutes(config) {
  const routes = Array.isArray(config.routes) ? config.routes.length : 0;
  const domains = Array.isArray(config.domains) ? config.domains.length : 0;
  return routes + domains;
}

function rebaseConfigPaths(config, fromDir, toDir) {
  const rebased = structuredClone(config);
  rebased.main = rebasePath(rebased.main, fromDir, toDir);
  if (rebased.assets && typeof rebased.assets === "object") {
    rebased.assets.directory = rebasePath(rebased.assets.directory, fromDir, toDir);
  }
  return rebased;
}

function rebasePath(value, fromDir, toDir) {
  if (typeof value !== "string" || path.isAbsolute(value)) {
    return value;
  }
  const relativePath = path.relative(toDir, path.resolve(fromDir, value));
  return relativePath || ".";
}

async function runWrangler(args) {
  const command = process.platform === "win32" ? "wrangler.cmd" : "wrangler";
  const child = spawn(command, args, { stdio: "inherit" });
  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`wrangler deploy failed with exit code ${exitCode}.`);
  }
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
