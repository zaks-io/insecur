#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DEFAULT_PREVIEW_URLS = {
  api: "https://api.preview.insecur.cloud",
  site: "https://preview.insecur.cloud",
  web: "https://app.preview.insecur.cloud",
};

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const PREVIEW_ENV_ALIASES = [
  ["PREVIEW_DATABASE_URL_MIGRATION", "DATABASE_URL_MIGRATION"],
  ["PREVIEW_POSTGRES_RUNTIME_ROLE", "INSECUR_POSTGRES_RUNTIME_ROLE"],
  ["PREVIEW_INSTANCE_ID", "INSECUR_INSTANCE_ID"],
  ["PREVIEW_SITE_AUDIT_EXPORT_SIGNING_PUBLIC_KEY", "INSECUR_SITE_AUDIT_EXPORT_SIGNING_PUBLIC_KEY"],
  ["TURNSTILE_SITE_KEY", "INSECUR_TURNSTILE_SITE_KEY"],
  ["WORKOS_CLIENT_ID", "INSECUR_WORKOS_CLIENT_ID"],
  ["WORKOS_AUTHKIT_ORIGIN", "INSECUR_WORKOS_AUTHKIT_ORIGIN"],
  [
    "PREVIEW_API_RATELIMIT_ONBOARDING_IP_NAMESPACE_ID",
    "INSECUR_API_RATELIMIT_ONBOARDING_IP_NAMESPACE_ID",
  ],
  [
    "PREVIEW_API_RATELIMIT_ONBOARDING_ACTOR_NAMESPACE_ID",
    "INSECUR_API_RATELIMIT_ONBOARDING_ACTOR_NAMESPACE_ID",
  ],
  [
    "PREVIEW_API_RATELIMIT_BOOTSTRAP_IP_NAMESPACE_ID",
    "INSECUR_API_RATELIMIT_BOOTSTRAP_IP_NAMESPACE_ID",
  ],
  [
    "PREVIEW_API_RATELIMIT_BOOTSTRAP_ACTOR_NAMESPACE_ID",
    "INSECUR_API_RATELIMIT_BOOTSTRAP_ACTOR_NAMESPACE_ID",
  ],
  [
    "PREVIEW_API_RATELIMIT_AUTH_EXCHANGE_IP_NAMESPACE_ID",
    "INSECUR_API_RATELIMIT_AUTH_EXCHANGE_IP_NAMESPACE_ID",
  ],
  [
    "PREVIEW_API_RATELIMIT_AUTH_DEVICE_TOKEN_IP_NAMESPACE_ID",
    "INSECUR_API_RATELIMIT_AUTH_DEVICE_TOKEN_IP_NAMESPACE_ID",
  ],
  ["PREVIEW_RUNTIME_ROOT_KEY_STORE_ID", "INSECUR_RUNTIME_ROOT_KEY_STORE_ID"],
  ["PREVIEW_RUNTIME_ROOT_KEY_SECRET_NAME", "INSECUR_RUNTIME_ROOT_KEY_SECRET_NAME"],
  [
    "PREVIEW_RUNTIME_AUDIT_EXPORT_HMAC_SECRET_NAME",
    "INSECUR_RUNTIME_AUDIT_EXPORT_HMAC_SECRET_NAME",
  ],
  [
    "PREVIEW_RUNTIME_AUDIT_EXPORT_SIGNING_SECRET_NAME",
    "INSECUR_RUNTIME_AUDIT_EXPORT_SIGNING_SECRET_NAME",
  ],
  ["PREVIEW_RUNTIME_BACKUPS_BUCKET_NAME", "INSECUR_RUNTIME_BACKUPS_BUCKET_NAME"],
  ["PREVIEW_HYPERDRIVE_ID", "INSECUR_RUNTIME_HYPERDRIVE_ID"],
];

const REQUIRED_DEPLOY_SECRET_ENV = [
  "RUNTIME_TOKEN_SIGNING_SECRET",
  "SESSION_SIGNING_SECRET",
  "TURNSTILE_SECRET_KEY",
  "WORKOS_API_KEY",
  "WORKOS_COOKIE_PASSWORD",
];
const REQUIRED_MIGRATION_ENV = ["DATABASE_URL_MIGRATION", "INSECUR_POSTGRES_RUNTIME_ROLE"];

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`::error::${message}`);
    process.exit(1);
  }
}

function main() {
  const env = normalizePreviewDeployEnv({ ...process.env });
  validatePreviewDeployEnv(env);
  const secretFiles = writePreviewSecretFiles(env);

  try {
    run("pnpm", turboArgs("deploy:preview:dry-run"), env);
    run("pnpm", ["migrate:preview"], env);
    run("pnpm", turboArgs("deploy:preview"), env);
  } finally {
    secretFiles.cleanup();
  }

  console.log(
    `Preview URLs: ${DEFAULT_PREVIEW_URLS.api}, ${DEFAULT_PREVIEW_URLS.web}, ${DEFAULT_PREVIEW_URLS.site}`,
  );
}

export function normalizePreviewDeployEnv(env) {
  applyAliases(env, PREVIEW_ENV_ALIASES);
  env.CLOUDFLARE_ENV = "preview";
  env.INSECUR_PREVIEW_CODE_DEPLOY = "false";
  env.INSECUR_REQUIRE_DEPLOY_IDENTITY = "true";
  env.INSECUR_REQUIRE_SENTRY_SOURCEMAPS = "true";
  env.INSECUR_DEPLOY_SHA ||= env.GITHUB_SHA;
  env.INSECUR_DEPLOY_RUN_ID ||= env.GITHUB_RUN_ID;
  env.INSECUR_DEPLOYED_AT ||= new Date().toISOString();
  env.SENTRY_RELEASE ||= env.INSECUR_DEPLOY_SHA;
  env.SENTRY_ORG ||= "zaksio";
  env.SENTRY_PROJECT ||= "insecur";
  return env;
}

export function validatePreviewDeployEnv(env) {
  const required = [
    ...REQUIRED_MIGRATION_ENV,
    ...REQUIRED_DEPLOY_SECRET_ENV,
    "INSECUR_DEPLOY_SHA",
    "INSECUR_DEPLOY_RUN_ID",
    "INSECUR_DEPLOYED_AT",
    "SENTRY_AUTH_TOKEN",
  ];
  const missing = [...new Set(required)].filter((name) => !hasEnvValue(env, name));
  if (missing.length > 0) {
    throw new Error(`Missing preview CI environment: ${missing.join(", ")}`);
  }
}

export function writePreviewSecretFiles(
  env,
  root = mkdtempSync(path.join(os.tmpdir(), "insecur-preview-secrets-")),
) {
  const files = {
    INSECUR_API_SECRETS_FILE: path.join(root, "api-preview-secrets.json"),
    INSECUR_RUNTIME_SECRETS_FILE: path.join(root, "runtime-preview-secrets.json"),
    INSECUR_WEB_SECRETS_FILE: path.join(root, "web-preview-secrets.json"),
  };

  writeSecretJson(files.INSECUR_RUNTIME_SECRETS_FILE, {
    RUNTIME_TOKEN_SIGNING_SECRET: env.RUNTIME_TOKEN_SIGNING_SECRET,
  });
  writeSecretJson(files.INSECUR_API_SECRETS_FILE, {
    RUNTIME_TOKEN_SIGNING_SECRET: env.RUNTIME_TOKEN_SIGNING_SECRET,
    SESSION_SIGNING_SECRET: env.SESSION_SIGNING_SECRET,
    WORKOS_API_KEY: env.WORKOS_API_KEY,
    WORKOS_COOKIE_PASSWORD: env.WORKOS_COOKIE_PASSWORD,
  });
  writeSecretJson(files.INSECUR_WEB_SECRETS_FILE, {
    SESSION_SIGNING_SECRET: env.SESSION_SIGNING_SECRET,
    TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY,
    WORKOS_API_KEY: env.WORKOS_API_KEY,
    WORKOS_COOKIE_PASSWORD: env.WORKOS_COOKIE_PASSWORD,
  });

  Object.assign(env, files);
  return { cleanup: () => rmSync(root, { force: true, recursive: true }), files, root };
}

function turboArgs(task) {
  return ["exec", "turbo", "run", task, "--cache=local:rw,remote:r", "--filter=!./packages/*"];
}

function run(command, args, env) {
  console.log(`> ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, { cwd: repoRoot, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
}

function applyAliases(env, aliases) {
  for (const [source, target] of aliases) env[target] ||= env[source];
}

function hasEnvValue(env, name) {
  return typeof env[name] === "string" && env[name].trim() !== "";
}

function writeSecretJson(filePath, values) {
  writeFileSync(filePath, `${JSON.stringify(values)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(filePath, 0o600);
}
