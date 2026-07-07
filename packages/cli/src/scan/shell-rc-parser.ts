import { classifyDotenvKeyName } from "./classifiers.js";

const EXPORT_KEY_PATTERN = /^\s*export\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/u;

export interface ShellRcExportKey {
  readonly key: string;
  readonly lineNumber: number;
}

function parseExportKey(line: string): string | null {
  const match = EXPORT_KEY_PATTERN.exec(line);
  return match?.[1] ?? null;
}

/**
 * Extract export variable key names from shell rc content.
 * Values are never returned — only key names that match secret key patterns.
 */
export function parseShellRcExportKeys(content: string): readonly ShellRcExportKey[] {
  const results: ShellRcExportKey[] = [];

  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    const key = parseExportKey(line);
    if (key !== null && classifyDotenvKeyName(key) !== null) {
      results.push({ key, lineNumber: index + 1 });
    }
  }

  return results;
}
