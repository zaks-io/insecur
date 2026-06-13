#!/usr/bin/env node
// Cloud smoke for the First Value loop. Drives write -> grant issue -> grant
// consume over HTTP against a DEPLOYED preview/-dev API Worker and asserts the secret
// value round-trips through the real Runtime Worker Service Binding. This is the
// post-deploy tripwire the local e2e test (apps/api/test/e2e/first-value-loop.e2e.test.ts)
// cannot be: it catches broken deploys, missing bindings, and bad secrets that only
// surface in the real multi-deploy runtime.
//
// HARD-FAILS when unconfigured (no SMOKE_BASE_URL) — a smoke that silently skips is
// theater. This script is wired into the gated pr-preview workflow, which itself
// stays opt-in until the -dev/preview Worker + Hyperdrive binding exist.

const baseUrl = requireEnv("SMOKE_BASE_URL").replace(/\/$/, "");
const authHeader = requireEnv("SMOKE_AUTH_BEARER");
const organizationId = requireEnv("SMOKE_ORGANIZATION_ID");
const projectId = requireEnv("SMOKE_PROJECT_ID");
const environmentId = requireEnv("SMOKE_ENVIRONMENT_ID");

const headers = {
  Authorization: authHeader.startsWith("Bearer ") ? authHeader : `Bearer ${authHeader}`,
  "Content-Type": "application/json",
};

const variableKey = `SMOKE_FV_${Date.now()}`;
const plaintext = `smoke-fv-${crypto.randomUUID()}`;

await main();

async function main() {
  await assertHealthz();

  await post(
    `/v1/orgs/${organizationId}/projects/${projectId}/environments/${environmentId}/secrets/by-variable-key`,
    { variableKey, value: plaintext },
    "secret write",
  );

  const issued = await post(
    `/v1/orgs/${organizationId}/runtime-injection/grants`,
    { projectId, environmentId, variableKey },
    "grant issue",
  );
  const grantId = issued.data?.grantId;
  if (typeof grantId !== "string") {
    throw new Error("grant issue did not return data.grantId");
  }

  const consumed = await post(
    `/v1/orgs/${organizationId}/runtime-injection/grants/${grantId}/consume`,
    { variableKey },
    "grant consume",
  );
  const encoded = consumed.delivery?.encodedValueUtf8;
  if (typeof encoded !== "string") {
    throw new Error("grant consume did not return delivery.encodedValueUtf8");
  }

  const decoded = Buffer.from(base64UrlToBase64(encoded), "base64").toString("utf8");
  if (decoded !== plaintext) {
    throw new Error("First Value loop did not round-trip the secret value");
  }

  process.stdout.write(
    JSON.stringify({ ok: true, smoke: "first-value-loop", baseUrl, grantId }) + "\n",
  );
}

async function assertHealthz() {
  const response = await fetch(`${baseUrl}/healthz`, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`/healthz returned ${response.status}`);
  }
}

async function post(path, body, label) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${redact(text)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} returned non-JSON body`);
  }
  return parsed;
}

function base64UrlToBase64(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  return pad === 0 ? padded : padded + "=".repeat(4 - pad);
}

function redact(text) {
  // Defensive: smoke values should never appear in error bodies, but never echo them.
  return text.split(plaintext).join("[redacted]");
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    process.stderr.write(`::error::${name} is required to run the First Value smoke\n`);
    process.exit(1);
  }
  return value;
}
