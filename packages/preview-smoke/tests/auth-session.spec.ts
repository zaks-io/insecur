import {
  assertEnvelopeData,
  assertEnvelopeError,
  assertEqual,
  assertStatus,
  assertTextIncludes,
  authHeaders,
  getJson,
  readJsonResponse,
  test,
  randomUUID,
} from "../src/fixtures";

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
});
