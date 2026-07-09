import {
  assertEnvelopeData,
  assertEnvelopeError,
  assertEqual,
  assertResponseFreeOfRedactedPatterns,
  assertStatus,
  assertTextIncludes,
  authHeaders,
  getJson,
  mintBearer,
  readJsonResponse,
  redactorForPreview,
  test,
  randomUUID,
} from "../src/fixtures";
import type { PreviewConfig } from "../src/env";

test.describe("preview auth and session @preview", () => {
  test("Web whoami authenticates smoke bearer through BFF to API @happy-path", async ({
    ownerBearer,
    preview,
  }) => {
    const response = await fetch(`${preview.webBaseUrl}/whoami`, {
      headers: authHeaders(ownerBearer),
    });
    const text = await response.text();

    assertStatus(response, 200, "Web /whoami auth", { bodyText: text });
    assertTextIncludes(text, "private Service Binding call", "Web /whoami auth");
    assertTextIncludes(text, preview.ownerUserId, "Web /whoami auth");
  });

  test("CLI PKCE authorize returns WorkOS redirect for loopback input @happy-path", async ({
    preview,
  }) => {
    const url = new URL("/v1/auth/cli/authorize", preview.apiBaseUrl);
    url.searchParams.set("redirect_uri", "http://127.0.0.1:49152/callback");
    url.searchParams.set("state", `smoke-${randomUUID()}`);
    url.searchParams.set("code_challenge", "smoke-code-challenge");
    url.searchParams.set("code_challenge_method", "S256");

    const response = await fetch(url.toString(), { redirect: "manual" });

    assertStatus(response, 302, "CLI authorize valid", { bodyText: await response.text() });
    const location = response.headers.get("location") ?? "";
    assertTextIncludes(location.toLowerCase(), "workos", "CLI authorize valid redirect");
  });

  test("CLI PKCE authorize rejects non-loopback redirect @happy-path", async ({ preview }) => {
    const url = new URL("/v1/auth/cli/authorize", preview.apiBaseUrl);
    url.searchParams.set("redirect_uri", "https://evil.example/callback");
    url.searchParams.set("state", `smoke-${randomUUID()}`);
    url.searchParams.set("code_challenge", "smoke-code-challenge");
    url.searchParams.set("code_challenge_method", "S256");

    const response = await fetch(url.toString(), { redirect: "manual" });
    const body = await readJsonResponse(response, "CLI authorize invalid");

    assertStatus(response, 400, "CLI authorize invalid", { bodyText: JSON.stringify(body) });
    assertEnvelopeError(body, "validation.invalid_command_input", "CLI authorize invalid");
  });

  test("API session whoami returns smoke actor @happy-path", async ({ ownerBearer, preview }) => {
    const body = await getJson(`${preview.apiBaseUrl}/v1/session/whoami`, "API whoami", {
      headers: authHeaders(ownerBearer),
    });
    const data = assertEnvelopeData(body, "API whoami");

    assertEqual(data.userId, preview.ownerUserId, "API whoami userId");
  });

  test("API session revoke is idempotent and fail-closed @negative", async ({ preview }) => {
    const bearer = await mintDedicatedRevokeBearer(preview);
    const redactor = redactorForPreview(preview, [bearer]);

    await test.step("session.whoami.before_revoke", async () => {
      const response = await fetch(`${preview.apiBaseUrl}/v1/session/whoami`, {
        headers: authHeaders(bearer),
      });
      const text = await response.text();

      assertResponseFreeOfRedactedPatterns(redactor, text, "API whoami before revoke");
      assertStatus(response, 200, "API whoami before revoke", { bodyText: text, redactor });
      const body = await readJsonResponse(response, "API whoami before revoke", text);
      const data = assertEnvelopeData(body, "API whoami before revoke");
      assertEqual(data.userId, preview.ownerUserId, "API whoami before revoke userId");
    });

    await test.step("session.revoke.idempotent", async () => {
      await assertSessionRevokeResponse({
        bearer,
        expectedRevoked: true,
        label: "API session revoke first",
        preview,
        redactor,
      });
      await assertSessionRevokeResponse({
        bearer,
        expectedRevoked: true,
        label: "API session revoke second",
        preview,
        redactor,
      });
    });

    await test.step("session.whoami.after_revoke", async () => {
      const response = await fetch(`${preview.apiBaseUrl}/v1/session/whoami`, {
        headers: authHeaders(bearer),
      });
      const text = await response.text();

      assertResponseFreeOfRedactedPatterns(redactor, text, "API whoami after revoke");
      assertStatus(response, 401, "API whoami after revoke", { bodyText: text, redactor });
      const body = await readJsonResponse(response, "API whoami after revoke", text);
      assertEnvelopeError(body, "auth.invalid", "API whoami after revoke");
    });
  });

  test("API session revoke no-ops without authentication @negative", async ({ preview }) => {
    const redactor = redactorForPreview(preview);
    await assertSessionRevokeResponse({
      expectedRevoked: false,
      label: "API session revoke unauthenticated",
      preview,
      redactor,
    });
  });
});

async function mintDedicatedRevokeBearer(preview: PreviewConfig): Promise<string> {
  return mintBearer({
    rawUserId: preview.ownerUserId,
    sessionId: `session_preview_smoke_revoke_${randomUUID()}`,
    signingSecret: preview.signingSecret,
    workosUserId: preview.ownerWorkosUserId,
  });
}

async function assertSessionRevokeResponse(input: {
  bearer?: string;
  expectedRevoked: boolean;
  label: string;
  preview: PreviewConfig;
  redactor: (value: unknown) => string;
}): Promise<void> {
  const response = await fetch(`${input.preview.apiBaseUrl}/v1/session/revoke`, {
    body: "{}",
    headers: {
      ...(input.bearer === undefined ? {} : authHeaders(input.bearer)),
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const text = await response.text();

  assertResponseFreeOfRedactedPatterns(input.redactor, text, input.label);
  assertStatus(response, 200, input.label, { bodyText: text, redactor: input.redactor });
  const body = await readJsonResponse(response, input.label, text);
  const data = assertEnvelopeData(body, input.label);
  assertEqual(data.revoked, input.expectedRevoked, `${input.label} revoked`);
}
