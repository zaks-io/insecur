#!/usr/bin/env node
// Cloud smoke for the First Value loop. Drives onboard -> write -> grant issue -> grant
// consume over HTTP against a DEPLOYED preview/-dev API Worker and asserts the secret
// value round-trips through the real Runtime Worker Service Binding. This is the
// post-deploy tripwire the local e2e test (apps/api/test/e2e/first-value-loop.e2e.test.ts)
// cannot be: it catches broken deploys, missing bindings, and bad secrets that only
// surface in the real multi-deploy runtime.
//
// HARD-FAILS when unconfigured (no SMOKE_BASE_URL) because a smoke that silently passes
// against nothing is worse than no smoke. This script is wired into the gated pr-preview
// workflow, which itself stays opt-in until preview Workers + Hyperdrive are enabled.
//
// Auth is self-minted, not a pasted bearer: a static token expires and turns the smoke
// falsely red. We mint a short-TTL ephemeral session credential at run time exactly as
// the e2e does, signed with the same SESSION_SIGNING_SECRET the deployed Worker holds.
// The minted actor must be admitted by a persisted user_admissions row on the preview
// database. The smoke then provisions a fresh personal org, so it needs no pre-seeded
// coordinates.
import { mintEphemeralSessionCredential } from "@insecur/auth";
import { userId } from "@insecur/domain";

const baseUrl = requireEnv("SMOKE_BASE_URL").replace(/\/$/, "");
const signingSecret = requireEnv("SMOKE_SESSION_SIGNING_SECRET");
const admittedUserId = requireEnv("SMOKE_ADMITTED_USER_ID");
const workosUserId = requireEnv("SMOKE_WORKOS_USER_ID");

const variableKey = `SMOKE_FV_${Date.now()}`;
const plaintext = `smoke-fv-${crypto.randomUUID()}`;

const headers = {
  Authorization: `Bearer ${await mintBearer()}`,
  "Content-Type": "application/json",
};

await main();

async function mintBearer() {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: userId.brand(admittedUserId),
      workosUserId,
      sessionId: "session_fv_smoke",
    },
    signingSecret,
  });
  return minted.credential;
}

async function main() {
  await assertHealthz();
  const coords = await onboardPersonalOrg();
  const grantId = await runFirstValueLoop(coords);
  process.stdout.write(
    JSON.stringify({
      ok: true,
      smoke: "first-value-loop",
      baseUrl,
      organizationId: coords.organizationId,
      grantId,
    }) + "\n",
  );
}

async function onboardPersonalOrg() {
  const onboarded = await post("/v1/onboarding/personal-organization", {}, "onboarding");
  const organizationId = onboarded.data?.organizationId;
  const projectId = onboarded.data?.projectId;
  const environmentId = onboarded.data?.developmentEnvironmentId;
  if (
    typeof organizationId !== "string" ||
    typeof projectId !== "string" ||
    typeof environmentId !== "string"
  ) {
    throw new Error("onboarding did not return organizationId/projectId/developmentEnvironmentId");
  }
  return { organizationId, projectId, environmentId };
}

async function runFirstValueLoop({ organizationId, projectId, environmentId }) {
  await post(
    `/v1/orgs/${organizationId}/projects/${projectId}/environments/${environmentId}/secrets/by-variable-key`,
    { organizationId, variableKey, value: plaintext },
    "secret write",
  );

  const issued = await post(
    `/v1/orgs/${organizationId}/runtime-injection/grants`,
    { organizationId, projectId, environmentId, variableKey },
    "grant issue",
  );
  const grantId = issued.data?.grantId;
  if (typeof grantId !== "string") {
    throw new Error("grant issue did not return data.grantId");
  }

  const consumed = await post(
    `/v1/orgs/${organizationId}/runtime-injection/grants/${grantId}/consume`,
    { organizationId, variableKey },
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
  return grantId;
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
