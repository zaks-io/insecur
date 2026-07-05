import {
  assertHeaderContains,
  assertHeaderEquals,
  assertStatus,
  assertTextIncludes,
  requireResponse,
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
