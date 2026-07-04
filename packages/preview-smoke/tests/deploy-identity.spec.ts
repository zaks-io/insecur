import { assertIdentity, getJson, test } from "../src/fixtures";

test.describe("preview deploy identity @preview", () => {
  test("API health serves the deployed SHA @happy-path", async ({ preview }) => {
    const body = await getJson(`${preview.apiBaseUrl}/healthz`, "API healthz");
    assertIdentity(body, "insecur-api", preview.expectedSha);
  });

  test("Web health serves the deployed SHA @happy-path", async ({ preview }) => {
    const body = await getJson(`${preview.webBaseUrl}/healthz`, "Web healthz");
    assertIdentity(body, "insecur-web", preview.expectedSha);
  });

  test("Site health serves the deployed SHA @happy-path", async ({ preview }) => {
    const body = await getJson(`${preview.siteBaseUrl}/healthz`, "Site healthz");
    assertIdentity(body, "insecur-site", preview.expectedSha);
  });
});
