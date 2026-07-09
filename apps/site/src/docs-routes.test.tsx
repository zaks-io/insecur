import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DocsPage } from "./components/docs-page.js";
import { DOC_PAGES } from "./docs/manifest.js";
import type { SiteEnv } from "./env.js";
import { ErrorIndexPage } from "./routes/errors.index.js";
import { tryStaticSiteResponse } from "./static-site-routes.js";

const env = {
  AUDIT_EXPORT_SIGNING_PUBLIC_KEY: "uyf4yAw8SnsMpN9tVr5glKfg0TFwss_hvYPyqt-Soos",
  DEPLOY_SHA: "sha",
  DEPLOY_RUN_ID: "1",
  DEPLOYED_AT: "1970-01-01T00:00:00.000Z",
} as SiteEnv;

describe("docs pages", () => {
  it("renders every docs page inside the docs frame", () => {
    for (const page of DOC_PAGES) {
      const markup = renderToStaticMarkup(<DocsPage page={page} />);
      expect(markup, page.slug).toContain("View as Markdown");
      expect(markup, page.slug).toContain(`href="${page.markdownHref}"`);
    }
  });

  it("renders the error index", () => {
    const markup = renderToStaticMarkup(<ErrorIndexPage />);
    expect(markup).toContain("Stable error codes");
    expect(markup).toContain("/errors/auth-required");
  });
});

describe("docs static routes", () => {
  it("serves llms.txt as plain text", async () => {
    const response = tryStaticSiteResponse("/llms.txt", "GET", env);
    expect(response?.status).toBe(200);
    expect(response?.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await response?.text()).toContain("https://insecur.cloud/docs/quickstart.md");
  });

  it("serves llms-full.txt with the whole corpus", async () => {
    const response = tryStaticSiteResponse("/llms-full.txt", "GET", env);
    expect(response?.status).toBe(200);
    const body = await response?.text();
    expect(body).toContain("Source: https://insecur.cloud/docs/agent-quickstart.md");
    expect(body).toContain("Source: https://insecur.cloud/docs/reference/errors.md");
  });

  it("serves every page's markdown twin verbatim", async () => {
    for (const page of DOC_PAGES) {
      const response = tryStaticSiteResponse(page.markdownHref, "GET", env);
      expect(response?.status, page.slug).toBe(200);
      expect(response?.headers.get("Content-Type"), page.slug).toBe("text/markdown; charset=utf-8");
      expect(await response?.text(), page.slug).toBe(page.raw);
    }
  });

  it("answers HEAD and rejects other methods on markdown twins", async () => {
    const head = tryStaticSiteResponse("/docs/quickstart.md", "HEAD", env);
    expect(head?.status).toBe(200);
    expect(await head?.text()).toBe("");
    const post = tryStaticSiteResponse("/docs/quickstart.md", "POST", env);
    expect(post?.status).toBe(405);
  });

  it("returns 404 for unknown markdown paths", () => {
    const response = tryStaticSiteResponse("/docs/does-not-exist.md", "GET", env);
    expect(response?.status).toBe(404);
  });

  it("leaves rendered docs paths to the router", () => {
    expect(tryStaticSiteResponse("/docs/quickstart", "GET", env)).toBeNull();
    expect(tryStaticSiteResponse("/docs/", "GET", env)).toBeNull();
    expect(tryStaticSiteResponse("/errors/auth-required", "GET", env)).toBeNull();
  });
});
