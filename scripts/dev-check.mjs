import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const optionalEnvKeys = [
  "DATABASE_URL_MIGRATION",
  "DATABASE_URL_RUNTIME",
  "WORKOS_API_KEY",
  "WORKOS_CLIENT_ID",
  "WORKOS_COOKIE_PASSWORD",
  "APP_BASE_URL",
  "WORKOS_REDIRECT_URI",
];

const results = [];

checkNode();
checkCommand("pnpm", ["--version"], (value) => value === "10.19.0", "pnpm 10.19.0");
checkCommand(
  "pnpm",
  ["--filter", "@insecur/worker", "exec", "wrangler", "--version"],
  (value) => /^4\./u.test(value),
  "Wrangler 4",
);
checkPath("apps/worker/wrangler.jsonc");
checkPath(".env.example");
checkPath("apps/worker/.dev.vars.example");
checkOptionalEnv();

for (const result of results) {
  console.log(`${result.status} ${result.label}`);
}

if (results.some((result) => result.status === "FAIL")) {
  process.exitCode = 1;
}

function checkNode() {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
  record(major === 24 ? "OK" : "FAIL", `Node ${process.versions.node} (expected major 24)`);
}

function checkCommand(command, args, isExpected, label) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
  });
  const value = result.stdout.trim().split(/\s+/u)[0] ?? "";
  record(
    result.status === 0 && isExpected(value) ? "OK" : "FAIL",
    `${label}: ${value || "missing"}`,
  );
}

function checkPath(relativePath) {
  record(existsSync(join(root, relativePath)) ? "OK" : "FAIL", relativePath);
}

function checkOptionalEnv() {
  const localKeys = readEnvKeys(".env.local");
  const missing = optionalEnvKeys.filter((key) => !process.env[key] && !localKeys.has(key));
  const status = missing.length === 0 ? "OK" : "WARN";
  record(status, `optional service env keys missing: ${missing.length}`);
}

function readEnvKeys(relativePath) {
  const path = join(root, relativePath);
  if (!existsSync(path)) {
    return new Set();
  }
  const names = readFileSync(path, "utf8").matchAll(/^([A-Z0-9_]+)=/gmu);
  return new Set(Array.from(names, (match) => match[1]));
}

function record(status, label) {
  results.push({ status, label });
}
