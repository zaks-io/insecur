import { parseDocMarkdown } from "./frontmatter.js";

/**
 * Docs manifest: every markdown file under ./content becomes one page, addressable two ways —
 * rendered HTML at /docs/<slug> and the raw markdown twin at /docs/<slug>.md — so agents can swap
 * between formats freely. The manifest is assembled at module init from the bundled markdown; a
 * malformed page fails the build/test run instead of shipping a broken docs tree.
 */

export interface DocPage {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly section: string;
  readonly order: number;
  /** Original file content including frontmatter — served verbatim as the .md twin. */
  readonly raw: string;
  /** Markdown body without frontmatter — the HTML rendering input. */
  readonly body: string;
  /** HTML page path, e.g. /docs/quickstart (index page: /docs/). */
  readonly href: string;
  /** Raw markdown twin path, e.g. /docs/quickstart.md. */
  readonly markdownHref: string;
}

export interface DocSection {
  readonly section: string;
  readonly pages: readonly DocPage[];
}

/** Canonical sidebar/llms.txt ordering. A page naming an unknown section fails module init. */
const SECTION_ORDER = ["Getting started", "Concepts", "Guides", "Reference", "CLI reference"];

const contentModules: Record<string, string> = import.meta.glob("./content/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

function buildPages(): readonly DocPage[] {
  const pages: DocPage[] = [];
  for (const [sourcePath, raw] of Object.entries(contentModules)) {
    const slug = sourcePath.replace(/^\.\/content\//, "").replace(/\.md$/, "");
    const { frontmatter, body } = parseDocMarkdown(sourcePath, raw);
    if (!SECTION_ORDER.includes(frontmatter.section)) {
      throw new Error(`docs page ${sourcePath} names unknown section: ${frontmatter.section}`);
    }
    pages.push({
      slug,
      ...frontmatter,
      raw,
      body,
      href: hrefForSlug(slug),
      markdownHref: `/docs/${slug}.md`,
    });
  }
  return pages.sort(
    (left, right) =>
      SECTION_ORDER.indexOf(left.section) - SECTION_ORDER.indexOf(right.section) ||
      left.order - right.order ||
      left.slug.localeCompare(right.slug),
  );
}

/** Directory index pages (cli/index.md) live at the directory path (/docs/cli). */
function hrefForSlug(slug: string): string {
  if (slug === "index") {
    return "/docs";
  }
  if (slug.endsWith("/index")) {
    return `/docs/${slug.slice(0, -"/index".length)}`;
  }
  return `/docs/${slug}`;
}

export const DOC_PAGES: readonly DocPage[] = buildPages();

const PAGES_BY_SLUG = new Map(DOC_PAGES.map((page) => [page.slug, page]));

export function getDocPage(slug: string): DocPage | undefined {
  const normalized = slug.replace(/\/+$/, "");
  return PAGES_BY_SLUG.get(normalized) ?? PAGES_BY_SLUG.get(`${normalized}/index`);
}

export const DOC_SECTIONS: readonly DocSection[] = SECTION_ORDER.map((section) => ({
  section,
  pages: DOC_PAGES.filter((page) => page.section === section),
})).filter((group) => group.pages.length > 0);
