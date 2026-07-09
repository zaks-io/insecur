#!/usr/bin/env node
// Generate the docs pages that must never drift from source: the CLI command reference (walked
// from the real commander tree), the exit-code and error-code references (from the normative
// registry in docs/cli-and-sync.md), and the error catalog JSON behind the /errors/<slug> pages.
//
// Run via `pnpm docs:cli` (requires the tsx loader: the script imports CLI/domain TypeScript
// source directly, same JIT-source convention as the rest of the workspace). `--check` fails when
// any committed output is stale, wired into `pnpm verify:policy` like routes:inventory.

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const contentDir = join(repoRoot, "apps", "site", "src", "docs", "content");
const generatedDir = join(repoRoot, "apps", "site", "src", "generated");

const { buildProgramForIntrospection } = await import(
  new URL("../../packages/cli/src/program.ts", import.meta.url).href
);
const { errorTypeUri } = await import(
  new URL("../../packages/cli/src/output/error-type-uri.ts", import.meta.url).href
);
const { parseErrorCodeRegistryTable } = await import(
  new URL("../../packages/domain/src/error-code-registry.ts", import.meta.url).href
);

const GENERATED_MARKER = "<!-- GENERATED — do not hand-edit. Regenerate with `pnpm docs:cli`. -->";

async function buildOutputs() {
  const program = buildProgramForIntrospection();
  const registryRows = parseErrorCodeRegistryTable();
  const outputs = new Map();

  const commands = [...program.commands].sort((left, right) =>
    left.name().localeCompare(right.name()),
  );

  outputs.set(join(contentDir, "cli", "index.md"), cliIndexMarkdown(program, commands));
  commands.forEach((command, index) => {
    outputs.set(
      join(contentDir, "cli", `${command.name()}.md`),
      commandMarkdown(command, index + 1),
    );
  });

  outputs.set(join(contentDir, "reference", "exit-codes.md"), exitCodesMarkdown());
  outputs.set(join(contentDir, "reference", "errors.md"), errorsMarkdown(registryRows));
  outputs.set(join(generatedDir, "error-catalog.json"), errorCatalogJson(registryRows));

  const formatted = new Map();
  for (const [filePath, raw] of outputs) {
    const config = await prettier.resolveConfig(filePath);
    formatted.set(filePath, await prettier.format(raw, { ...config, filepath: filePath }));
  }
  return formatted;
}

function frontmatter({ title, description, section, order }) {
  return [
    "---",
    `title: ${title}`,
    `description: ${description}`,
    `section: ${section}`,
    `order: ${order}`,
    "---",
    "",
    GENERATED_MARKER,
    "",
  ].join("\n");
}

function commandPath(command) {
  const names = [];
  for (let current = command; current; current = current.parent) {
    names.unshift(current.name());
  }
  return names.join(" ");
}

function usageLine(command) {
  return `${commandPath(command)} ${command.usage()}`.trim();
}

function optionRows(command) {
  return command.options
    .filter((option) => !option.hidden)
    .map((option) => {
      const details = [];
      if (option.mandatory) {
        details.push("required");
      }
      if (option.defaultValue !== undefined && option.defaultValue !== false) {
        details.push(`default: \`${JSON.stringify(option.defaultValue).replace(/^"|"$/g, "")}\``);
      }
      const suffix = details.length > 0 ? ` (${details.join("; ")})` : "";
      return `| \`${option.flags}\` | ${escapeCell(option.description)}${suffix} |`;
    });
}

function argumentRows(command) {
  return command.registeredArguments.map(
    (argument) => `| \`${argument.name()}\` | ${escapeCell(argument.description || "")} |`,
  );
}

function escapeCell(text) {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function commandSection(command, depth, includeHeading = true) {
  const lines = [];
  if (includeHeading) {
    lines.push(`${"#".repeat(depth)} \`${commandPath(command)}\``, "");
  }
  if (command.description()) {
    lines.push(command.description(), "");
  }
  lines.push("```sh", usageLine(command), "```", "");
  if (command.registeredArguments.length > 0) {
    lines.push("| Argument | Description |", "| --- | --- |", ...argumentRows(command), "");
  }
  const options = optionRows(command);
  if (options.length > 0) {
    lines.push("| Option | Description |", "| --- | --- |", ...options, "");
  }
  for (const subcommand of command.commands) {
    lines.push(...commandSection(subcommand, Math.min(depth + 1, 4)));
  }
  return lines;
}

function commandMarkdown(command, order) {
  const title = `insecur ${command.name()}`;
  const description =
    command.description() || `Reference for the \`${commandPath(command)}\` command.`;
  const lines = [
    frontmatter({ title, description: escapeCell(description), section: "CLI reference", order }),
    `# ${title}`,
    "",
    ...commandSection(command, 1, false),
    "## Related",
    "",
    "- [CLI overview and global flags](/docs/cli)",
    "- [Exit codes](/docs/reference/exit-codes)",
    "- [Error codes](/docs/reference/errors)",
  ];
  return `${lines.join("\n")}\n`;
}

function cliIndexMarkdown(program, commands) {
  const lines = [
    frontmatter({
      title: "CLI overview",
      description:
        "Every insecur command, the global flags, and the conventions shared by all of them.",
      section: "CLI reference",
      order: 0,
    }),
    "# CLI overview",
    "",
    program.description(),
    "",
    "Install with `curl -fsSL https://insecur.cloud/install.sh | sh` (see [Installation](/docs/installation)).",
    "Every command supports `--json` for metadata-only machine-readable output and exits with a",
    "[stable exit code](/docs/reference/exit-codes). Failures carry stable",
    "[error codes](/docs/reference/errors) with remediation commands in `--json` output. Secret",
    "values are never accepted as command-line arguments and never appear in any output.",
    "",
    "## Commands",
    "",
    "| Command | Description |",
    "| --- | --- |",
    ...commands.map(
      (command) =>
        `| [\`insecur ${command.name()}\`](/docs/cli/${command.name()}) | ${escapeCell(command.description())} |`,
    ),
    "",
    "## Global flags",
    "",
    "These apply to every command.",
    "",
    "| Option | Description |",
    "| --- | --- |",
    ...optionRows(program),
    "",
    "## Related",
    "",
    "- [Quickstart](/docs/quickstart)",
    "- [Environment variables](/docs/reference/environment-variables)",
  ];
  return `${lines.join("\n")}\n`;
}

function exitCodesMarkdown() {
  const source = readFileSync(join(repoRoot, "docs", "cli-and-sync.md"), "utf8");
  const sectionStart = source.indexOf("## Exit Codes");
  const sectionEnd = source.indexOf("### Error Code To Exit Code Mapping", sectionStart);
  if (sectionStart < 0 || sectionEnd < 0) {
    throw new Error("Could not locate the Exit Codes section in docs/cli-and-sync.md");
  }
  const bullets = [...source.slice(sectionStart, sectionEnd).matchAll(/^- `(\d+)`: (.+)$/gm)];
  if (bullets.length === 0) {
    throw new Error("Exit Codes section in docs/cli-and-sync.md has no exit-code bullets");
  }
  const lines = [
    frontmatter({
      title: "Exit codes",
      description: "The stable exit codes every insecur CLI command uses.",
      section: "Reference",
      order: 3,
    }),
    "# Exit codes",
    "",
    "Every `insecur` command exits with one of these codes. They are stable: scripts and agents",
    "can branch on them. The exit code is derived from the failure's stable error code; the",
    "[error reference](/docs/reference/errors) lists the exact mapping per code.",
    "",
    "| Exit code | Meaning |",
    "| --- | --- |",
    ...bullets.map(([, code, meaning]) => `| \`${code}\` | ${escapeCell(meaning)} |`),
    "",
    "Exit code `10` deserves special note for agents: it means a human step-up is required. The",
    "`--json` error body includes the operation id; poll it with",
    "`insecur operations wait <operation-id> --json` while a human clears the gate in the web",
    "console. See [Approvals and step-up](/docs/approvals).",
    "",
    "## Related",
    "",
    "- [Error codes](/docs/reference/errors)",
    "- [CLI overview](/docs/cli)",
  ];
  return `${lines.join("\n")}\n`;
}

function errorSlug(code) {
  return code.replace(/[._]/g, "-");
}

function errorsMarkdown(registryRows) {
  const lines = [
    frontmatter({
      title: "Error codes",
      description:
        "Every stable error code the API and CLI return, with exit code, HTTP status, and type URI.",
      section: "Reference",
      order: 4,
    }),
    "# Error codes",
    "",
    "Failures carry a stable dotted error code (for example `auth.required`) that never changes",
    "with message wording. In HTTP responses the code also appears as an RFC 9457 `type` URI,",
    "`https://insecur.dev/errors/<slug>`, which resolves to a landing page for that error. CLI",
    "`--json` error envelopes include the code, a `retryable` flag, and remediation commands when",
    "one exists. HTTP status `n/a (client-side)` marks codes that never cross the network.",
    "",
    "| Error code | Exit | HTTP | Remediation | Notes |",
    "| --- | --- | --- | --- | --- |",
    ...registryRows.map(
      (row) =>
        `| [\`${row.code}\`](/errors/${errorSlug(row.code)}) | \`${row.exitCode}\` | \`${row.httpStatus}\` | ${row.remediation} | ${escapeCell(row.notes)} |`,
    ),
    "",
    "## Related",
    "",
    "- [Exit codes](/docs/reference/exit-codes)",
    "- [API overview](/docs/reference/api)",
  ];
  return `${lines.join("\n")}\n`;
}

function errorCatalogJson(registryRows) {
  const catalog = registryRows.map((row) => ({
    code: row.code,
    slug: errorSlug(row.code),
    typeUri: errorTypeUri(row.code),
    exitCode: row.exitCode,
    httpStatus: row.httpStatus,
    remediationRequired: row.remediation === "required",
    notes: row.notes,
  }));
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

const outputs = await buildOutputs();
const check = process.argv.includes("--check");
const stale = [];

// Orphan sweep: a renamed/removed CLI command must not leave its old generated page behind, where
// the manifest would keep serving and listing it. Everything under content/cli belongs to this
// generator, so any file there outside the current output set is stale.
const cliDir = join(contentDir, "cli");
for (const entry of readdirSync(cliDir, { withFileTypes: true })) {
  const filePath = join(cliDir, entry.name);
  if (!entry.isFile() || !entry.name.endsWith(".md") || outputs.has(filePath)) {
    continue;
  }
  if (check) {
    stale.push(`${relative(repoRoot, filePath)} (orphaned; no longer generated)`);
    continue;
  }
  rmSync(filePath);
  process.stdout.write(`Removed ${relative(repoRoot, filePath)} (orphaned)\n`);
}

for (const [filePath, generated] of outputs) {
  const relPath = relative(repoRoot, filePath);
  if (check) {
    let committed = null;
    try {
      committed = readFileSync(filePath, "utf8");
    } catch {
      committed = null;
    }
    if (committed !== generated) {
      stale.push(relPath);
    }
    continue;
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, generated);
  process.stdout.write(`Wrote ${relPath}\n`);
}

if (check) {
  if (stale.length > 0) {
    process.stderr.write(
      `generated CLI docs are stale; run \`pnpm docs:cli\` and commit the result:\n${stale
        .map((file) => `  ${file}`)
        .join("\n")}\n`,
    );
    process.exit(1);
  }
  process.stdout.write("generated CLI docs are up to date\n");
}
