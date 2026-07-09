/**
 * Minimal frontmatter parser for the docs content tree. The docs pipeline owns both sides of this
 * format (authored + generated markdown), so this parses exactly the four required scalar fields
 * and fails loudly on anything malformed instead of tolerating drift.
 */

interface DocFrontmatter {
  readonly title: string;
  readonly description: string;
  readonly section: string;
  readonly order: number;
}

export interface ParsedDoc {
  readonly frontmatter: DocFrontmatter;
  readonly body: string;
}

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n/;

function parseFields(sourcePath: string, block: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of block.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    const separator = line.indexOf(":");
    if (separator < 0) {
      throw new Error(`docs page ${sourcePath} has a malformed frontmatter line: ${line}`);
    }
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^"(.*)"$/, "$1");
    fields.set(line.slice(0, separator).trim(), value);
  }
  return fields;
}

export function parseDocMarkdown(sourcePath: string, raw: string): ParsedDoc {
  const match = FRONTMATTER_PATTERN.exec(raw);
  const block = match?.[1];
  if (match === null || block === undefined) {
    throw new Error(`docs page ${sourcePath} is missing a frontmatter block`);
  }

  const fields = parseFields(sourcePath, block);
  const order = Number(requireField(sourcePath, fields, "order"));
  if (!Number.isInteger(order)) {
    throw new Error(`docs page ${sourcePath} has a non-integer frontmatter order`);
  }

  return {
    frontmatter: {
      title: requireField(sourcePath, fields, "title"),
      description: requireField(sourcePath, fields, "description"),
      section: requireField(sourcePath, fields, "section"),
      order,
    },
    body: raw.slice(match[0].length),
  };
}

function requireField(sourcePath: string, fields: Map<string, string>, key: string): string {
  const value = fields.get(key);
  if (!value) {
    throw new Error(`docs page ${sourcePath} is missing frontmatter field: ${key}`);
  }
  return value;
}
