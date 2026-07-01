#!/usr/bin/env node
// Deploy the Public Site Worker (@insecur/site, ADR-0078). Intentionally SEPARATE from
// scripts/deploy-preview.mjs: the Public Site has no database, no keyring, no API/Runtime binding,
// no secrets, and no First Value smoke. This path only builds the site and runs `wrangler deploy`
// for the chosen environment, then health-checks it.
//
// Usage:
//   node scripts/deploy-site.mjs                 # deploy the preview env (insecur-site-preview)
//   node scripts/deploy-site.mjs --production    # deploy production (insecur-site) — manual only
//   node scripts/deploy-site.mjs --check         # validate config, no deploy
//   node scripts/deploy-site.mjs --skip-health   # skip the post-deploy health check
//
// Production is manual-only until the legal/security publication gates settle (ADR-0078); it is
// never invoked automatically on a `main` push.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { emitOutput, run, waitForHealthz } from "./lib/deploy-utils.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const siteConfig = "apps/site/wrangler.jsonc";
const previewName = "insecur-site-preview";
const productionName = "insecur-site";

const options = parseArgs(process.argv.slice(2));

assertConfig();

if (options.check) {
  process.stdout.write("OK site deploy configuration is internally consistent\n");
  process.exit(0);
}

await main();

async function main() {
  buildSite();
  deploySite();

  const baseUrl = resolveBaseUrl();
  if (baseUrl) {
    emitOutput("base_url", baseUrl);
  }
  process.stdout.write(
    `Public Site deployed: ${baseUrl || "(set CLOUDFLARE_WORKERS_SUBDOMAIN to resolve URL)"}\n`,
  );

  if (!options.skipHealth && baseUrl) {
    await waitForHealthz(baseUrl, 30);
  }
}

function buildSite() {
  run("pnpm", ["--filter", "@insecur/site", "exec", "vite", "build"], { cwd: root });
}

function deploySite() {
  // The production env is the top-level config; preview is the `preview` wrangler environment.
  const args = [
    "--filter",
    "@insecur/site",
    "exec",
    "wrangler",
    "deploy",
    "--config",
    join(root, siteConfig),
  ];
  if (options.production) {
    args.push("--env", "");
  } else {
    args.push("--env", "preview");
  }
  run("pnpm", args, { cwd: root });
}

function resolveBaseUrl() {
  if (process.env.SITE_BASE_URL) {
    return process.env.SITE_BASE_URL;
  }
  const subdomain = process.env.CLOUDFLARE_WORKERS_SUBDOMAIN;
  if (!subdomain) {
    return "";
  }
  const name = options.production ? productionName : previewName;
  return `https://${name}.${subdomain}.workers.dev`;
}

function assertConfig() {
  const config = readSiteConfig();
  if (config.name !== productionName) {
    throw new Error(`${siteConfig} top-level name must be '${productionName}'`);
  }
  if (config.env?.preview?.name !== previewName) {
    throw new Error(`${siteConfig} env.preview.name must be '${previewName}'`);
  }
  // The Public Site must never declare a control-plane binding (product-spec §2 / ADR-0078). Check
  // the parsed config keys, not raw text — the file's comments legitimately name these bindings.
  for (const scope of [config, config.env?.preview]) {
    if (!scope) {
      continue;
    }
    if ("hyperdrive" in scope || "services" in scope || "secrets_store_secrets" in scope) {
      throw new Error(`${siteConfig} declares a forbidden control-plane binding (ADR-0078)`);
    }
  }
}

function readSiteConfig() {
  const raw = readFileSync(join(root, siteConfig), "utf8");
  const withoutComments = raw
    .split("\n")
    .map((line) => stripLineComment(line))
    .join("\n");
  return JSON.parse(withoutComments.replace(/,(\s*[}\]])/g, "$1"));
}

function stripLineComment(line) {
  let inString = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"' && line[i - 1] !== "\\") {
      inString = !inString;
    }
    if (!inString && line[i] === "/" && line[i + 1] === "/") {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseArgs(argv) {
  return {
    check: argv.includes("--check"),
    production: argv.includes("--production"),
    skipHealth: argv.includes("--skip-health"),
  };
}
