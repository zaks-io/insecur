export interface DotenvEntry {
  readonly key: string;
  readonly lineNumber: number;
}

function parseDotenvLine(trimmed: string, lineNumber: number): DotenvEntry | null {
  if (trimmed.length === 0 || trimmed.startsWith("#")) {
    return null;
  }

  const body = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length).trimStart()
    : trimmed;
  const key = parseKeyValueLine(body);
  return key ? { key, lineNumber } : null;
}

/**
 * Hand-rolled dotenv parser. Reads keys only; values are classified in memory
 * and never returned from this module.
 */
export function parseDotenvKeys(content: string): readonly DotenvEntry[] {
  const entries: DotenvEntry[] = [];
  const lines = content.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      continue;
    }
    const parsed = parseDotenvLine(line.trim(), index + 1);
    if (parsed) {
      entries.push(parsed);
    }
  }

  return entries;
}

/** Returns the variable key from a single `KEY=...` line, or null when unparseable. */
function parseKeyValueLine(line: string): string | null {
  const eqIndex = line.indexOf("=");
  if (eqIndex <= 0) {
    return null;
  }

  const rawKey = line.slice(0, eqIndex).trim();
  if (!isValidDotenvKey(rawKey)) {
    return null;
  }

  return rawKey;
}

function isValidDotenvKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(key);
}

/** Classify a dotenv value shape without exposing the value. */
export function classifyDotenvValueShape(value: string): {
  readonly trimmed: string;
  readonly unquoted: string;
  readonly length: number;
  readonly hasKnownPrefix: boolean;
  readonly looksSecretLike: boolean;
} {
  const trimmed = value.trim();
  const unquoted = stripQuotes(trimmed);
  const length = unquoted.length;
  const hasKnownPrefix = hasKnownSecretPrefix(unquoted);
  const looksSecretLike =
    length >= 8 && hasMixedCharset(unquoted) && !isObviouslyNonSecret(unquoted);

  return { trimmed, unquoted, length, hasKnownPrefix, looksSecretLike };
}

/** Extract value portion from a dotenv line for in-memory classification only. */
export function extractDotenvValue(line: string): string | null {
  const trimmed = line.trim();
  const body = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length).trimStart()
    : trimmed;
  const eqIndex = body.indexOf("=");
  if (eqIndex <= 0) {
    return null;
  }
  return body.slice(eqIndex + 1);
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function hasKnownSecretPrefix(value: string): boolean {
  const prefixes = ["AKIA", "ghp_", "gho_", "ghu_", "ghs_", "ghr_", "sk-", "xox", "xoxb-", "xoxp-"];
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function hasMixedCharset(value: string): boolean {
  if (value.length < 8) {
    return false;
  }
  const hasAlpha = /[A-Za-z]/u.test(value);
  const hasDigit = /\d/u.test(value);
  const hasSpecial = /[^A-Za-z0-9]/u.test(value);
  return (hasAlpha && hasDigit) || (hasAlpha && hasSpecial) || (hasDigit && hasSpecial);
}

function isObviouslyNonSecret(value: string): boolean {
  const lower = value.toLowerCase();
  const benign = new Set([
    "true",
    "false",
    "development",
    "production",
    "test",
    "staging",
    "localhost",
    "http://localhost",
    "https://localhost",
  ]);
  if (benign.has(lower)) {
    return true;
  }
  if (/^\d+$/u.test(value)) {
    return true;
  }
  return /^https?:\/\//iu.test(value) && !hasKnownSecretPrefix(value);
}
