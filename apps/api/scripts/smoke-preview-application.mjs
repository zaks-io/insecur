#!/usr/bin/env node
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import { mintEphemeralSessionCredential } from "@insecur/auth";
import { invitationId, membershipId, userId } from "@insecur/domain";

import {
  PreviewSmokeError,
  appendGithubSummary,
  completeManifestRun,
  createManifestRun,
  createRedactor,
  failCheck,
  mintSmokeSentinel,
  passCheck,
  runPlaintextSweep,
  skipCheck,
  writeEvidenceArtifact,
} from "./preview-smoke-lib.mjs";

const sentinel = mintSmokeSentinel();
let redactor = createRedactor(sentinel.variants.map((variant) => variant.pattern));
const evidencePath =
  process.env.PREVIEW_SMOKE_EVIDENCE_PATH ?? "preview-smoke-evidence/evidence.json";
const run = createManifestRun({
  sha: process.env.SMOKE_EXPECTED_DEPLOY_SHA ?? process.env.GITHUB_SHA,
  runId: process.env.GITHUB_RUN_ID,
  workflowUrl: workflowUrl(),
});

try {
  const config = await loadConfig();
  redactor = createRedactor(redactionPatterns(config));

  await assertDeployIdentities(config);
  await assertSiteRoot(config);
  await assertWebRoot(config);
  await assertWebWhoami(config);
  await assertCliAuth(config);
  await assertApiWhoami(config);

  const coords = await onboardPersonalOrganization(config);
  await runFirstValueLoop(config, coords);
  await runMembershipPaths(config, coords);
  await submitFeedback(config, coords);
  await assertPlaintextSweep(config);

  completeManifestRun(run);
  await writeOutputs();
} catch (error) {
  const normalized = normalizeSmokeError(error);
  recordFailure(normalized);
  completeManifestRun(run);
  await writeOutputs();
  process.stderr.write(`::error::${normalized.checkId}: ${normalized.message}\n`);
  process.exit(1);
}

async function assertDeployIdentities(config) {
  await runCheck("deploy.identity.api", async () => {
    const identity = await getJson(`${config.apiBaseUrl}/healthz`, "API healthz");
    assertIdentity(identity, "insecur-api", config.expectedSha);
    run.identities.api = identity;
    passCheck(run, "deploy.identity.api", {
      service: identity.service,
      deploySha: identity.deploySha,
      runId: identity.runId,
      deployedAt: identity.deployedAt,
    });
  });

  await runCheck("deploy.identity.web", async () => {
    const identity = await getJson(`${config.webBaseUrl}/healthz`, "Web healthz");
    assertIdentity(identity, "insecur-web", config.expectedSha);
    run.identities.web = identity;
    passCheck(run, "deploy.identity.web", {
      service: identity.service,
      deploySha: identity.deploySha,
      runId: identity.runId,
      deployedAt: identity.deployedAt,
    });
  });

  await runCheck("deploy.identity.site", async () => {
    const identity = await getJson(`${config.siteBaseUrl}/healthz`, "Site healthz");
    assertIdentity(identity, "insecur-site", config.expectedSha);
    run.identities.site = identity;
    passCheck(run, "deploy.identity.site", {
      service: identity.service,
      deploySha: identity.deploySha,
      runId: identity.runId,
      deployedAt: identity.deployedAt,
    });
  });
}

async function assertSiteRoot(config) {
  await runCheck("site.root", async () => {
    const response = await fetch(`${config.siteBaseUrl}/`);
    const text = await response.text();
    assertStatus(response, 200, "Site root", text);
    assertHeaderContains(response, "x-robots-tag", "noindex", "Site root");
    assertHeaderEquals(response, "x-frame-options", "DENY", "Site root");
    assertHeaderEquals(response, "x-content-type-options", "nosniff", "Site root");
    assertTextIncludes(text, "Secrets for teams shipping with agents", "Site root");
    assertTextIncludes(text, "insecur.cloud", "Site root");
    passCheck(run, "site.root", { status: response.status });
  });
}

async function assertWebRoot(config) {
  await runCheck("web.root", async () => {
    const response = await fetch(`${config.webBaseUrl}/`);
    const text = await response.text();
    assertStatus(response, 200, "Web root", text);
    assertHeaderContains(response, "content-security-policy", "default-src", "Web root");
    assertHeaderEquals(response, "x-frame-options", "DENY", "Web root");
    assertHeaderEquals(response, "x-content-type-options", "nosniff", "Web root");
    assertTextIncludes(text, "insecur web BFF", "Web root");
    passCheck(run, "web.root", { status: response.status });
  });
}

async function assertWebWhoami(config) {
  await runCheck("web.whoami.unauth", async () => {
    const response = await fetch(`${config.webBaseUrl}/whoami`);
    const text = await response.text();
    assertStatus(response, 200, "Web /whoami unauth", text);
    assertTextIncludes(text, "No admitted browser session was found", "Web /whoami unauth");
    passCheck(run, "web.whoami.unauth", { status: response.status });
  });

  await runCheck("web.whoami.auth", async () => {
    const response = await fetch(`${config.webBaseUrl}/whoami`, {
      headers: authHeaders(config.ownerBearer),
    });
    const text = await response.text();
    assertStatus(response, 200, "Web /whoami auth", text);
    assertTextIncludes(text, "private Service Binding call", "Web /whoami auth");
    assertTextIncludes(text, config.ownerUserId, "Web /whoami auth");
    passCheck(run, "web.whoami.auth", { status: response.status, userId: config.ownerUserId });
  });
}

async function assertCliAuth(config) {
  await runCheck("auth.cli.authorize.valid", async () => {
    const url = new URL("/v1/auth/cli/authorize", config.apiBaseUrl);
    url.searchParams.set("redirect_uri", "http://127.0.0.1:49152/callback");
    url.searchParams.set("state", `smoke-${randomUUID()}`);
    url.searchParams.set("code_challenge", "smoke-code-challenge");
    url.searchParams.set("code_challenge_method", "S256");
    const response = await fetch(url, { redirect: "manual" });
    assertStatus(response, 302, "CLI authorize valid", await response.text());
    const location = response.headers.get("location") ?? "";
    if (!location.includes("workos")) {
      throw new Error("CLI authorize valid did not redirect to WorkOS");
    }
    passCheck(run, "auth.cli.authorize.valid", { status: response.status });
  });

  await runCheck("auth.cli.authorize.invalid", async () => {
    const url = new URL("/v1/auth/cli/authorize", config.apiBaseUrl);
    url.searchParams.set("redirect_uri", "https://evil.example/callback");
    url.searchParams.set("state", `smoke-${randomUUID()}`);
    url.searchParams.set("code_challenge", "smoke-code-challenge");
    url.searchParams.set("code_challenge_method", "S256");
    const response = await fetch(url, { redirect: "manual" });
    const body = await readJsonResponse(response, "CLI authorize invalid");
    assertStatus(response, 400, "CLI authorize invalid", JSON.stringify(body));
    assertEnvelopeError(body, "validation.invalid_command_input", "CLI authorize invalid");
    passCheck(run, "auth.cli.authorize.invalid", { status: response.status });
  });
}

async function assertApiWhoami(config) {
  await runCheck("api.session.whoami", async () => {
    const body = await getJson(`${config.apiBaseUrl}/v1/session/whoami`, "API whoami", {
      headers: authHeaders(config.ownerBearer),
    });
    assertEnvelopeOk(body, "API whoami");
    assertEqual(body.data?.userId, config.ownerUserId, "API whoami userId");
    passCheck(run, "api.session.whoami", {
      actorType: body.data?.actorType,
      userId: body.data?.userId,
    });
  });
}

async function onboardPersonalOrganization(config) {
  return runCheck("onboarding.personal_organization", async () => {
    const body = await postJson(
      `${config.apiBaseUrl}/v1/onboarding/personal-organization`,
      {},
      "Guided onboarding",
      config.ownerBearer,
    );
    assertEnvelopeOk(body, "Guided onboarding");
    const coords = {
      organizationId: requireString(body.data?.organizationId, "onboarding organizationId"),
      projectId: requireString(body.data?.projectId, "onboarding projectId"),
      environmentId: requireString(
        body.data?.developmentEnvironmentId,
        "onboarding developmentEnvironmentId",
      ),
      defaultTeamId: requireString(body.data?.defaultTeamId, "onboarding defaultTeamId"),
      ownerMembershipId: requireString(
        body.data?.ownerMembershipId,
        "onboarding ownerMembershipId",
      ),
    };
    Object.assign(run.resources, coords);
    passCheck(run, "onboarding.personal_organization", coords);
    return coords;
  });
}

async function runFirstValueLoop(config, coords) {
  const variableKey = `SMOKE_PREVIEW_${Date.now()}`;

  await runCheck("secrets.write", async () => {
    const body = await postJson(
      `${config.apiBaseUrl}/v1/orgs/${coords.organizationId}/projects/${coords.projectId}/environments/${coords.environmentId}/secrets/by-variable-key`,
      { organizationId: coords.organizationId, variableKey, value: sentinel.value },
      "Secret write",
      config.ownerBearer,
    );
    assertEnvelopeOk(body, "Secret write");
    run.resources.secretId = requireString(body.data?.secretId, "secret write secretId");
    run.resources.secretVersionId = requireString(
      body.data?.secretVersionId,
      "secret write secretVersionId",
    );
    passCheck(run, "secrets.write", {
      secretId: run.resources.secretId,
      secretVersionId: run.resources.secretVersionId,
      variableKey,
    });
  });

  await runCheck("runtime_injection.grant_issue", async () => {
    const body = await postJson(
      `${config.apiBaseUrl}/v1/orgs/${coords.organizationId}/runtime-injection/grants`,
      {
        organizationId: coords.organizationId,
        projectId: coords.projectId,
        environmentId: coords.environmentId,
        variableKey,
      },
      "Grant issue",
      config.ownerBearer,
    );
    assertEnvelopeOk(body, "Grant issue");
    run.resources.grantId = requireString(body.data?.grantId, "grant issue grantId");
    collectOperationId(body);
    passCheck(run, "runtime_injection.grant_issue", {
      grantId: run.resources.grantId,
      expiresAt: body.data?.expiresAt,
    });
  });

  await runCheck("runtime_injection.grant_consume", async () => {
    const body = await postJson(
      `${config.apiBaseUrl}/v1/orgs/${coords.organizationId}/runtime-injection/grants/${run.resources.grantId}/consume`,
      { organizationId: coords.organizationId, variableKey },
      "Grant consume",
      config.ownerBearer,
    );
    assertEqual(body.ok, true, "Grant consume ok");
    const encoded = requireString(body.delivery?.encodedValueUtf8, "grant consume encoded value");
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    assertEqual(decoded, sentinel.value, "Grant consume round trip");
    collectOperationId(body);
    passCheck(run, "runtime_injection.grant_consume", {
      grantId: body.delivery?.grantId,
      secretVersionId: body.delivery?.secretVersionId,
    });
  });

  await runCheck("runtime_injection.grant_replay_reject", async () => {
    const response = await fetch(
      `${config.apiBaseUrl}/v1/orgs/${coords.organizationId}/runtime-injection/grants/${run.resources.grantId}/consume`,
      {
        method: "POST",
        headers: { ...authHeaders(config.ownerBearer), "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: coords.organizationId, variableKey }),
      },
    );
    const text = await response.text();
    if (response.ok) {
      throw new Error("Grant replay unexpectedly succeeded");
    }
    const body = parseJson(text, "Grant replay");
    if (body.ok !== false || typeof body.error?.code !== "string") {
      throw new Error("Grant replay did not return a failed error envelope");
    }
    passCheck(run, "runtime_injection.grant_replay_reject", {
      status: response.status,
      code: body.error.code,
    });
  });

  await pollOperationIfPresent(config, coords);
}

async function pollOperationIfPresent(config, coords) {
  const operationId = run.resources.operationId;
  if (typeof operationId !== "string") {
    skipCheck(run, "operations.poll", "No operation id returned by current happy paths.");
    return;
  }
  await runCheck("operations.poll", async () => {
    const body = await getJson(
      `${config.apiBaseUrl}/v1/orgs/${coords.organizationId}/operations/${operationId}`,
      "Operation poll",
      { headers: authHeaders(config.ownerBearer) },
    );
    assertEnvelopeOk(body, "Operation poll");
    assertEqual(body.data?.operationId, operationId, "Operation poll operationId");
    passCheck(run, "operations.poll", {
      operationId,
      state: body.data?.state,
      intentCode: body.data?.intentCode,
    });
  });
}

async function runMembershipPaths(config, coords) {
  await runCheck("organizations.create", async () => {
    const body = await postJson(
      `${config.apiBaseUrl}/v1/orgs/${coords.organizationId}/organizations`,
      { organizationDisplayName: `Smoke operator org ${run.runId ?? Date.now()}` },
      "Organization create",
      config.ownerBearer,
    );
    assertEnvelopeOk(body, "Organization create");
    passCheck(run, "organizations.create", {
      organizationId: body.data?.organizationId,
      defaultTeamId: body.data?.defaultTeamId,
    });
  });

  const invId = invitationId.generate();
  const memId = membershipId.generate();

  await runCheck("invitations.create", async () => {
    const body = await postJson(
      `${config.apiBaseUrl}/v1/orgs/${coords.organizationId}/invitations`,
      {
        inviteeUserId: config.inviteeUserId,
        rolePreset: "developer",
        projectId: coords.projectId,
        invitationId: invId,
      },
      "Invitation create",
      config.ownerBearer,
    );
    assertEnvelopeOk(body, "Invitation create");
    assertEqual(body.data?.invitationId, invId, "Invitation create invitationId");
    run.resources.invitationId = invId;
    passCheck(run, "invitations.create", {
      invitationId: invId,
      inviteeUserId: config.inviteeUserId,
    });
  });

  await runCheck("invitations.accept", async () => {
    const body = await postJson(
      `${config.apiBaseUrl}/v1/orgs/${coords.organizationId}/invitations/${invId}/accept`,
      { membershipId: memId },
      "Invitation accept",
      config.inviteeBearer,
    );
    assertEnvelopeOk(body, "Invitation accept");
    assertEqual(body.data?.invitationId, invId, "Invitation accept invitationId");
    run.resources.inviteeMembershipId = requireString(
      body.data?.membershipId,
      "invitation accept membershipId",
    );
    passCheck(run, "invitations.accept", {
      invitationId: invId,
      membershipId: run.resources.inviteeMembershipId,
    });
  });
}

async function submitFeedback(config, coords) {
  await runCheck("design_partner_feedback.submit", async () => {
    const body = await postJson(
      `${config.apiBaseUrl}/v1/orgs/${coords.organizationId}/design-partner-feedback`,
      {
        feedbackKind: "feedback.kind.praise",
        noteCode: "feedback.note.praise_loop",
        grantId: run.resources.grantId,
      },
      "Design-partner feedback",
      config.ownerBearer,
    );
    assertEnvelopeOk(body, "Design-partner feedback");
    passCheck(run, "design_partner_feedback.submit", {
      feedbackId: body.data?.feedbackId,
    });
  });
}

async function assertPlaintextSweep(config) {
  await runCheck("plaintext_sweep.postgres", async () => {
    const sweep = await runPlaintextSweep(config.databaseUrl, sentinel);
    run.plaintextSweep = {
      columnCount: sweep.columnCount,
      encodings: sweep.encodings,
      hitCount: sweep.hitCount,
      hits: sweep.hits,
      sentinelFingerprint: sentinel.fingerprint,
    };
    if (sweep.hits.length > 0) {
      throw new Error(
        `Plaintext sweep found ${String(sweep.hits.length)} sentinel hit(s): ${JSON.stringify(sweep.hits)}`,
      );
    }
    passCheck(run, "plaintext_sweep.postgres", {
      columnCount: sweep.columnCount,
      encodings: sweep.encodings,
      hitCount: 0,
    });
  });
}

async function runCheck(checkId, action) {
  try {
    return await action();
  } catch (error) {
    throw new PreviewSmokeError(checkId, sanitizeError(error), { cause: error });
  }
}

async function postJson(url, body, label, bearer) {
  return requestJson(url, label, {
    method: "POST",
    headers: { ...authHeaders(bearer), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function getJson(url, label, init = {}) {
  return requestJson(url, label, init);
}

async function requestJson(url, label, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed with ${String(response.status)}: ${redactor(text)}`);
  }
  return parseJson(text, label);
}

async function readJsonResponse(response, label) {
  const text = await response.text();
  return parseJson(text, label);
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned non-JSON body`);
  }
}

function assertIdentity(body, service, expectedSha) {
  assertEqual(body.ok, true, `${service} health ok`);
  assertEqual(body.service, service, `${service} health service`);
  assertEqual(body.deploySha, expectedSha, `${service} health deploySha`);
  requireString(body.runId, `${service} health runId`);
  requireString(body.deployedAt, `${service} health deployedAt`);
}

function assertEnvelopeOk(body, label) {
  assertEqual(body.ok, true, `${label} ok`);
  if (typeof body.data !== "object" || body.data === null) {
    throw new Error(`${label} missing data object`);
  }
}

function assertEnvelopeError(body, code, label) {
  assertEqual(body.ok, false, `${label} ok`);
  assertEqual(body.error?.code, code, `${label} error code`);
}

function assertStatus(response, expected, label, bodyText) {
  if (response.status !== expected) {
    throw new Error(`${label} returned ${String(response.status)}: ${redactor(bodyText)}`);
  }
}

function assertHeaderEquals(response, name, expected, label) {
  const value = response.headers.get(name);
  if (value !== expected) {
    throw new Error(`${label} expected ${name}: ${expected}, got ${String(value)}`);
  }
}

function assertHeaderContains(response, name, expected, label) {
  const value = response.headers.get(name) ?? "";
  if (!value.toLowerCase().includes(expected.toLowerCase())) {
    throw new Error(`${label} expected ${name} to include ${expected}`);
  }
}

function assertTextIncludes(text, expected, label) {
  if (!text.includes(expected)) {
    throw new Error(`${label} did not include expected text: ${expected}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} expected ${String(expected)}, got ${String(actual)}`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function collectOperationId(body) {
  const operationId = body?.meta?.operationId ?? body?.data?.operationId ?? body?.operationId;
  if (typeof operationId === "string" && run.resources.operationId === undefined) {
    run.resources.operationId = operationId;
  }
}

function authHeaders(bearer) {
  return { Authorization: `Bearer ${bearer}` };
}

function redactionPatterns(config) {
  return [
    ...sentinel.variants.map((variant) => variant.pattern),
    config.databaseUrl,
    ...databasePasswordPatterns(config.databaseUrl),
    config.signingSecret,
    config.ownerBearer,
    config.inviteeBearer,
  ];
}

function databasePasswordPatterns(databaseUrl) {
  try {
    const password = new URL(databaseUrl).password;
    return [password, decodeURIComponent(password)];
  } catch {
    return [];
  }
}

function sanitizeError(error) {
  if (error instanceof Error) {
    return redactor(error.message);
  }
  return redactor(String(error));
}

function normalizeSmokeError(error) {
  if (error instanceof PreviewSmokeError) {
    return { checkId: error.checkId, message: error.message };
  }
  return { checkId: "workflow.preview_smoke", message: sanitizeError(error) };
}

function recordFailure(failure) {
  if (run.checks.some((check) => check.id === failure.checkId)) {
    failCheck(run, failure.checkId, failure.message);
    return;
  }
  run.failure = failure;
}

async function writeOutputs() {
  await writeEvidenceArtifact(evidencePath, run);
  await appendGithubSummary(process.env.GITHUB_STEP_SUMMARY, run);
}

function workflowUrl() {
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!repository || !runId) {
    return undefined;
  }
  return `https://github.com/${repository}/actions/runs/${runId}`;
}

async function loadConfig() {
  const signingSecret = requireEnv("SMOKE_SESSION_SIGNING_SECRET");
  const ownerUserId = requireEnv("SMOKE_ADMITTED_USER_ID");
  const ownerWorkosUserId = requireEnv("SMOKE_WORKOS_USER_ID");
  const inviteeUserId = requireEnv("SMOKE_INVITEE_ADMITTED_USER_ID");
  const inviteeWorkosUserId = requireEnv("SMOKE_INVITEE_WORKOS_USER_ID");
  return {
    apiBaseUrl: requireEnv("SMOKE_API_BASE_URL", "SMOKE_BASE_URL").replace(/\/$/u, ""),
    webBaseUrl: requireEnv("SMOKE_WEB_BASE_URL").replace(/\/$/u, ""),
    siteBaseUrl: requireEnv("SMOKE_SITE_BASE_URL").replace(/\/$/u, ""),
    expectedSha: requireEnv("SMOKE_EXPECTED_DEPLOY_SHA", "GITHUB_SHA"),
    databaseUrl: requireEnv("PREVIEW_DATABASE_URL_MIGRATION", "DATABASE_URL_MIGRATION"),
    ownerUserId,
    inviteeUserId,
    ownerBearer: await mintBearer(
      ownerUserId,
      ownerWorkosUserId,
      signingSecret,
      "session_preview_smoke_owner",
    ),
    inviteeBearer: await mintBearer(
      inviteeUserId,
      inviteeWorkosUserId,
      signingSecret,
      "session_preview_smoke_invitee",
    ),
    signingSecret,
    ownerWorkosUserId,
    inviteeWorkosUserId,
  };
}

async function mintBearer(rawUserId, workosUserId, signingSecret, sessionId) {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: userId.brand(rawUserId),
      workosUserId,
      sessionId,
    },
    signingSecret,
  });
  return minted.credential;
}

function requireEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value.trim() !== "") {
      return value;
    }
  }
  throw new Error(`${names.join(" or ")} is required`);
}
