import {
  assertEqual,
  assertHeaderContains,
  assertHeaderEquals,
  assertStatus,
  assertTextIncludes,
  readJsonResponse,
  requireResponse,
  requireString,
  expect,
  test,
} from "../src/fixtures";

test.describe("preview public surfaces @preview", () => {
  test("Public Site root renders launch content with security headers @happy-path", async ({
    page,
    preview,
  }) => {
    const response = await page.goto(`${preview.siteBaseUrl}/`);
    const text = await page.textContent("body");

    assertStatus(response, 200, "Site root");
    const siteRoot = requireResponse(response, "Site root");
    assertHeaderContains(siteRoot, "x-robots-tag", "noindex", "Site root");
    assertHeaderEquals(siteRoot, "x-frame-options", "DENY", "Site root");
    assertHeaderEquals(siteRoot, "x-content-type-options", "nosniff", "Site root");
    assertTextIncludes(text ?? "", "Secrets for teams shipping with agents", "Site root");
    assertTextIncludes(text ?? "", "insecur.cloud", "Site root");
  });

  test("Web BFF root renders with security headers @happy-path", async ({ page, preview }) => {
    const response = await page.goto(`${preview.webBaseUrl}/`);
    const text = await page.textContent("body");

    assertStatus(response, 200, "Web root");
    const webRoot = requireResponse(response, "Web root");
    assertHeaderContains(webRoot, "content-security-policy", "default-src", "Web root");
    assertHeaderEquals(webRoot, "x-frame-options", "DENY", "Web root");
    assertHeaderEquals(webRoot, "x-content-type-options", "nosniff", "Web root");
    assertTextIncludes(text ?? "", "insecur web console", "Web root");
  });

  test("Site coverage badge serves Shields-compatible JSON @happy-path", async ({ preview }) => {
    const response = await fetch(`${preview.siteBaseUrl}/badges/coverage.json`);
    const text = await response.text();

    assertStatus(response, 200, "Site coverage badge", { bodyText: text });
    assertHeaderEquals(
      response,
      "content-type",
      "application/json; charset=utf-8",
      "Site coverage badge",
    );
    assertHeaderEquals(response, "x-content-type-options", "nosniff", "Site coverage badge");

    const body = await readJsonResponse(response, "Site coverage badge", text);
    assertEqual(body.schemaVersion, 1, "Site coverage badge schemaVersion");
    assertEqual(body.label, "coverage", "Site coverage badge label");
    requireString(body.message, "Site coverage badge message");
    requireString(body.color, "Site coverage badge color");
  });

  test("Site install.sh serves POSIX installer script @happy-path", async ({ preview }) => {
    const response = await fetch(`${preview.siteBaseUrl}/install.sh`);
    const text = await response.text();

    assertStatus(response, 200, "Site install.sh", { bodyText: text.slice(0, 200) });
    assertHeaderEquals(
      response,
      "content-type",
      "text/x-shellscript; charset=utf-8",
      "Site install.sh",
    );
    assertHeaderEquals(response, "x-frame-options", "DENY", "Site install.sh");
    assertTextIncludes(text, "#!/bin/sh", "Site install.sh");
    assertTextIncludes(text, 'REPO="zaks-io/insecur"', "Site install.sh");
    assertTextIncludes(text, "insecur CLI installer", "Site install.sh");
  });

  test("Site install.ps1 serves PowerShell installer script @happy-path", async ({ preview }) => {
    const response = await fetch(`${preview.siteBaseUrl}/install.ps1`);
    const text = await response.text();

    assertStatus(response, 200, "Site install.ps1", { bodyText: text.slice(0, 200) });
    assertHeaderEquals(response, "content-type", "text/plain; charset=utf-8", "Site install.ps1");
    assertHeaderEquals(response, "x-frame-options", "DENY", "Site install.ps1");
    assertTextIncludes(text, "insecur CLI installer", "Site install.ps1");
    assertTextIncludes(text, "zaks-io/insecur", "Site install.ps1");
    assertTextIncludes(text, "Set-StrictMode", "Site install.ps1");
  });

  test("Web whoami redirects unauthenticated visitors to login @happy-path", async ({
    page,
    preview,
  }) => {
    const response = await page.goto(`${preview.webBaseUrl}/whoami`);
    const text = await page.textContent("body");

    assertStatus(response, 200, "Web /whoami unauth");
    expect(page.url(), "Web /whoami unauth should land on /login with returnTo").toContain(
      "/login?returnTo=%2Fwhoami",
    );
    assertTextIncludes(text ?? "", "Sign in", "Web /whoami unauth");
  });
});
