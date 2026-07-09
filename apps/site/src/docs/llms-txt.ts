import { DOC_PAGES, DOC_SECTIONS } from "./manifest.js";

/**
 * /llms.txt — the agent entry point to the documentation (llmstxt.org convention). Links point at
 * the raw markdown twins so an agent can read pages without HTML parsing; every page also serves
 * rendered HTML at the same path without the .md suffix. /llms-full.txt is the companion corpus:
 * every page's markdown concatenated with a source-URL divider per page. Both are built from the
 * docs manifest at module init so they can never list or omit a page that does not resolve.
 */

const CANONICAL_ORIGIN = "https://insecur.cloud";

function buildLlmsTxt(): string {
  const lines = [
    "# insecur",
    "",
    "> No-reveal secrets custody for teams shipping with coding agents and CI. insecur holds the",
    "> canonical secret and lets your code and your agents use it, without a plaintext read-back",
    "> path through the product. The `insecur` CLI is the primary interface for humans and agents.",
    "",
    "Every documentation page is served two ways: rendered HTML at the listed URL without the",
    "`.md` suffix, and raw markdown at the `.md` URL. All CLI and API output is metadata-only;",
    "commands support `--json` and exit with stable codes.",
    "",
  ];

  for (const group of DOC_SECTIONS) {
    lines.push(`## ${group.section}`, "");
    for (const page of group.pages) {
      lines.push(`- [${page.title}](${CANONICAL_ORIGIN}${page.markdownHref}): ${page.description}`);
    }
    lines.push("");
  }

  lines.push(
    "## Other resources",
    "",
    `- [Complete documentation in one file](${CANONICAL_ORIGIN}/llms-full.txt): every page below concatenated as markdown`,
    `- [Error reference](${CANONICAL_ORIGIN}/errors): landing pages for every RFC 9457 error type URI the API and CLI return`,
    `- [Install script (macOS/Linux)](${CANONICAL_ORIGIN}/install.sh): curl -fsSL https://insecur.cloud/install.sh | sh`,
    `- [Install script (Windows)](${CANONICAL_ORIGIN}/install.ps1): irm https://insecur.cloud/install.ps1 | iex`,
    "",
  );

  return lines.join("\n");
}

export const LLMS_TXT = buildLlmsTxt();

function buildLlmsFullTxt(): string {
  const parts = [
    "# insecur — complete documentation",
    "",
    `Every documentation page concatenated as markdown. Index: ${CANONICAL_ORIGIN}/llms.txt.`,
    "Each page begins with a divider naming its canonical source URL.",
    "",
  ];
  for (const page of DOC_PAGES) {
    parts.push(
      "---",
      "",
      `Source: ${CANONICAL_ORIGIN}${page.markdownHref}`,
      "",
      page.body.trim(),
      "",
    );
  }
  return parts.join("\n");
}

export const LLMS_FULL_TXT = buildLlmsFullTxt();
