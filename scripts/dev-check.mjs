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
const localPostgresEnvKeys = [
  "INSECUR_POSTGRES_PORT",
  "INSECUR_POSTGRES_DB",
  "INSECUR_POSTGRES_SUPERUSER",
  "INSECUR_POSTGRES_SUPERUSER_PASSWORD",
  "INSECUR_POSTGRES_MIGRATION_ROLE",
  "INSECUR_POSTGRES_MIGRATION_PASSWORD",
  "INSECUR_POSTGRES_RUNTIME_ROLE",
  "INSECUR_POSTGRES_RUNTIME_PASSWORD",
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
checkOptionalCommand(
  "docker",
  ["--version"],
  (value) => /^Docker version /u.test(value),
  "Docker CLI",
);
checkOptionalCommand(
  "docker",
  ["compose", "version"],
  (value) => /^Docker Compose version v?(?:[2-9]|[1-9][0-9]+)\./u.test(value),
  "Docker Compose >=2",
);
checkOptionalCommand(
  "docker",
  ["info", "--format", "{{.ServerVersion}}"],
  (value) => value.length > 0,
  "Docker daemon",
);
checkPath("apps/worker/wrangler.jsonc");
checkPath("compose.yaml");
checkPath("infra/postgres/init/001-local-roles.sh");
checkPath("infra/postgres/check-runtime-role.sh");
checkPath(".env.example");
checkPath("apps/worker/.dev.vars.example");
checkLocalPostgresEnv();
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

function checkOptionalCommand(command, args, isExpected, label) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
  });
  const value = result.stdout.trim();
  record(
    result.status === 0 && isExpected(value) ? "OK" : "WARN",
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

function checkLocalPostgresEnv() {
  const localKeys = readEnvKeys(".env.local");
  const missing = localPostgresEnvKeys.filter((key) => !process.env[key] && !localKeys.has(key));
  const status = missing.length === 0 ? "OK" : "WARN";
  record(status, `local Postgres env keys missing: ${missing.length}`);
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
