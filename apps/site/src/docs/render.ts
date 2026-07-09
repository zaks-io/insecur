import { Marked, type Tokens } from "marked";

/**
 * Markdown-to-HTML rendering for the docs pages. Content is repo-authored (hand-written or
 * generated from source), never user input, so the rendered HTML is trusted by construction.
 * Headings get stable slug ids so section anchors survive re-rendering and can be deep-linked
 * from llms.txt consumers and other pages.
 */

function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const marked = new Marked({ gfm: true });

marked.use({
  renderer: {
    heading(token: Tokens.Heading): string {
      const id = headingId(token.text);
      const inline = this.parser.parseInline(token.tokens);
      const tag = `h${String(token.depth)}`;
      return `<${tag} id="${id}"><a href="#${id}">${inline}</a></${tag}>\n`;
    },
  },
});

const htmlCache = new Map<string, string>();

export function renderDocHtml(cacheKey: string, markdownBody: string): string {
  const cached = htmlCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const html = marked.parse(markdownBody, { async: false });
  htmlCache.set(cacheKey, html);
  return html;
}
