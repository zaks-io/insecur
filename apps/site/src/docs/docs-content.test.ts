import { describe, expect, it } from "vitest";

import { ERROR_CATALOG, getErrorCatalogEntry } from "./error-catalog.js";
import { LLMS_FULL_TXT, LLMS_TXT } from "./llms-txt.js";
import { DOC_PAGES, DOC_SECTIONS, getDocPage } from "./manifest.js";
import { renderDocHtml } from "./render.js";

// The docs tree is assembled at module init, so most structural defects (missing frontmatter,
// unknown section) already fail on import. These tests guard the cross-surface contracts: llms.txt
// only lists resolvable pages, every page renders, and the load-bearing honesty claims survive
// edits (same posture as legal-pages.test.tsx).

describe("docs manifest", () => {
  it("contains the load-bearing pages", () => {
    for (const slug of [
      "index",
      "quickstart",
      "installation",
      "how-it-works",
      "concepts",
      "security-model",
      "agents",
      "cli/index",
      "reference/exit-codes",
      "reference/errors",
    ]) {
      expect(getDocPage(slug), slug).toBeDefined();
    }
  });

  it("resolves directory-index slugs at the directory path", () => {
    expect(getDocPage("cli")).toBe(getDocPage("cli/index"));
    expect(getDocPage("cli/")).toBe(getDocPage("cli/index"));
    expect(getDocPage("cli/index")?.href).toBe("/docs/cli");
  });

  it("has unique hrefs and markdown twins for every page", () => {
    const hrefs = DOC_PAGES.map((page) => page.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const page of DOC_PAGES) {
      expect(page.markdownHref).toBe(`/docs/${page.slug}.md`);
    }
  });

  it("renders every page to HTML without throwing", () => {
    for (const page of DOC_PAGES) {
      const html = renderDocHtml(page.slug, page.body);
      expect(html, page.slug).toContain("<h1");
    }
  });

  it("groups every page into an ordered section", () => {
    const grouped = DOC_SECTIONS.flatMap((section) => section.pages);
    expect(grouped.length).toBe(DOC_PAGES.length);
  });
});

describe("llms.txt", () => {
  it("lists the markdown twin of every docs page", () => {
    for (const page of DOC_PAGES) {
      expect(LLMS_TXT, page.slug).toContain(`https://insecur.cloud${page.markdownHref}`);
    }
  });

  it("only links markdown URLs that resolve to a page", () => {
    const links = [...LLMS_TXT.matchAll(/https:\/\/insecur\.cloud\/docs\/([^)]+)\.md/g)];
    expect(links.length).toBeGreaterThan(0);
    for (const [, slug] of links) {
      expect(slug).toBeDefined();
      expect(getDocPage(slug ?? ""), slug).toBeDefined();
    }
  });
});

describe("llms-full.txt", () => {
  it("contains every page's body under its source URL", () => {
    for (const page of DOC_PAGES) {
      expect(LLMS_FULL_TXT, page.slug).toContain(
        `Source: https://insecur.cloud${page.markdownHref}`,
      );
      expect(LLMS_FULL_TXT, page.slug).toContain(page.body.trim().slice(0, 200));
    }
  });
});

describe("honest claims", () => {
  it("keeps the zero-knowledge disclaimer in the security model page", () => {
    const page = getDocPage("security-model");
    expect(page?.body).toContain("zero-knowledge");
    expect(page?.body).toContain("no-reveal");
  });

  it("keeps the development-tier boundary honest in how-it-works", () => {
    const page = getDocPage("how-it-works");
    expect(page?.body).toContain("blast radius");
  });
});

describe("error catalog", () => {
  it("has unique slugs derived from dotted codes", () => {
    expect(ERROR_CATALOG.length).toBeGreaterThan(100);
    const slugs = new Set<string>();
    for (const entry of ERROR_CATALOG) {
      expect(entry.slug).toBe(entry.code.replace(/[._]/g, "-"));
      expect(entry.typeUri).toBe(`https://insecur.dev/errors/${entry.slug}`);
      expect(slugs.has(entry.slug), entry.slug).toBe(false);
      slugs.add(entry.slug);
    }
  });

  it("resolves entries by slug", () => {
    const entry = getErrorCatalogEntry("auth-required");
    expect(entry?.code).toBe("auth.required");
    expect(entry?.exitCode).toBe(3);
  });
});
