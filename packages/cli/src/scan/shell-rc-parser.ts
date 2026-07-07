import { classifyDotenvKeyName } from "./classifiers.js";
import type { ScanConfidence } from "./types.js";

const EXPORT_KEY_PATTERN = /^\s*export\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/u;

export interface ShellRcExportKey {
  readonly key: string;
  readonly confidence: ScanConfidence;
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

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    const key = parseExportKey(line);
    if (key === null) {
      continue;
    }
    const confidence = classifyDotenvKeyName(key);
    if (confidence !== null) {
      results.push({ key, confidence });
    }
  }

  return results;
}
