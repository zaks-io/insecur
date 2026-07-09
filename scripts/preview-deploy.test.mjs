import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  normalizePreviewDeployEnv,
  validatePreviewDeployEnv,
  writePreviewSecretFiles,
} from "./preview-deploy.mjs";

test("normalizes GitHub preview environment names for the CI deploy", () => {
  const env = normalizePreviewDeployEnv(completeGithubPreviewEnv());

  assert.equal(env.CLOUDFLARE_ENV, "preview");
  assert.equal(env.INSECUR_DEPLOY_SHA, "abcdef123456");
  assert.equal(env.INSECUR_DEPLOY_RUN_ID, "123456789");
  assert.equal(env.SENTRY_RELEASE, "abcdef123456");
  assert.equal(env.INSECUR_INSTANCE_ID, "inst_preview");
  assert.equal(env.INSECUR_PREVIEW_CODE_DEPLOY, "false");
  assert.doesNotThrow(() => validatePreviewDeployEnv(env));
});

test("requires CI-only migration, secret, identity, and Sentry inputs", () => {
  const env = normalizePreviewDeployEnv(completeGithubPreviewEnv());
  delete env.RUNTIME_TOKEN_SIGNING_SECRET;
  delete env.INSECUR_DEPLOYED_AT;

  assert.throws(() => validatePreviewDeployEnv(env), /RUNTIME_TOKEN_SIGNING_SECRET/u);
});

test("writes per-Worker Wrangler secrets files without leaking into config", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "insecur-preview-deploy-test-"));
  const secretFiles = writePreviewSecretFiles(completeGithubPreviewEnv(), tempDir);

  try {
    assert.deepEqual(await readJson(secretFiles.files.INSECUR_RUNTIME_SECRETS_FILE), {
      RUNTIME_TOKEN_SIGNING_SECRET: "runtime-secret",
    });
    assert.deepEqual(await readJson(secretFiles.files.INSECUR_WEB_SECRETS_FILE), {
      SESSION_SIGNING_SECRET: "session-secret",
      TURNSTILE_SECRET_KEY: "turnstile-secret",
      WORKOS_API_KEY: "workos-secret",
      WORKOS_COOKIE_PASSWORD: "cookie-secret",
    });
    assert.equal((await stat(secretFiles.files.INSECUR_WEB_SECRETS_FILE)).mode & 0o777, 0o600);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function completeGithubPreviewEnv() {
  return {
    GITHUB_RUN_ID: "123456789",
    GITHUB_SHA: "abcdef123456",
    INSECUR_DEPLOYED_AT: "2026-07-09T18:00:00.000Z",
    PREVIEW_DATABASE_URL_MIGRATION: "postgres://migration",
    PREVIEW_INSTANCE_ID: "inst_preview",
    PREVIEW_POSTGRES_RUNTIME_ROLE: "runtime_role",
    RUNTIME_TOKEN_SIGNING_SECRET: "runtime-secret",
    SENTRY_AUTH_TOKEN: "sentry-token",
    SESSION_SIGNING_SECRET: "session-secret",
    TURNSTILE_SECRET_KEY: "turnstile-secret",
    WORKOS_API_KEY: "workos-secret",
    WORKOS_COOKIE_PASSWORD: "cookie-secret",
  };
}
