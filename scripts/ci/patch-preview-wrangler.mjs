#!/usr/bin/env node
// Patch the two preview wrangler configs in place for a single PR deploy.
// `wrangler --var` cannot patch a Hyperdrive binding id or a Service Binding target
// (both are structured config, not vars), so we rewrite the placeholders directly:
//   - apps/runtime: env.preview DB Hyperdrive id  -> the per-PR Hyperdrive id
//   - apps/api:     env.preview RUNTIME service    -> insecur-runtime-pr-N
//
// Targeted string replacement (not JSON.parse) because these are JSONC files with
// comments and trailing commas. Each replacement asserts it changed exactly the known
// placeholder, and fails loud if the placeholder is missing (config drift).
import { readFileSync, writeFileSync } from "node:fs";

const prNumber = requireOption("--pr");
const hyperdriveId = requireOption("--hyperdrive-id");
if (!/^[1-9][0-9]*$/.test(prNumber)) {
  throw new Error(`--pr must be a positive integer, got '${prNumber}'`);
}
if (!/^[0-9a-f-]{32,36}$/i.test(hyperdriveId)) {
  throw new Error(`--hyperdrive-id is not a Hyperdrive id: '${hyperdriveId}'`);
}

const runtimeWorkerName = `insecur-runtime-pr-${prNumber}`;
const RUNTIME_WRANGLER = "apps/runtime/wrangler.jsonc";
const API_WRANGLER = "apps/api/wrangler.jsonc";
const PLACEHOLDER_HYPERDRIVE_ID = "0000000000000000000000000000000a";

patchOnce(
  RUNTIME_WRANGLER,
  `"id": "${PLACEHOLDER_HYPERDRIVE_ID}"`,
  `"id": "${hyperdriveId}"`,
  "runtime env.preview Hyperdrive id placeholder",
);

// The API's env.preview RUNTIME service must target the per-PR runtime worker name so the
// Service Binding resolves to insecur-runtime-pr-N (deployed first). The default config has two
// "service": "insecur-runtime" occurrences (top-level + env.preview); patch only env.preview's.
patchPreviewRuntimeService(API_WRANGLER, runtimeWorkerName);

process.stdout.write(
  `Patched preview configs for PR ${prNumber}: Hyperdrive ${hyperdriveId}, RUNTIME -> ${runtimeWorkerName}\n`,
);

function patchOnce(path, find, replace, label) {
  const source = readFileSync(path, "utf8");
  const count = occurrences(source, find);
  if (count !== 1) {
    throw new Error(`Expected exactly one ${label} in ${path}, found ${count}.`);
  }
  writeFileSync(path, source.replace(find, replace));
}

// Replace the LAST "service": "insecur-runtime" occurrence (env.preview sits below top-level).
function patchPreviewRuntimeService(path, workerName) {
  const source = readFileSync(path, "utf8");
  const find = '"service": "insecur-runtime"';
  const index = source.lastIndexOf(find);
  if (index === -1) {
    throw new Error(`Expected a RUNTIME service binding in ${path}, found none.`);
  }
  const patched =
    source.slice(0, index) + `"service": "${workerName}"` + source.slice(index + find.length);
  writeFileSync(path, patched);
}

function occurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function requireOption(name) {
  const argv = process.argv.slice(2);
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1);
  }
  const index = argv.indexOf(name);
  if (index === -1 || index + 1 >= argv.length) {
    throw new Error(`Set ${name}.`);
  }
  return argv[index + 1];
}
