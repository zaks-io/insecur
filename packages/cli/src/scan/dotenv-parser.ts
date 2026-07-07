import { normalizeDotenvLineBody, splitDotenvAssignmentBody } from "../input/dotenv-line.js";

export interface DotenvEntry {
  readonly key: string;
  readonly lineNumber: number;
}

function parseDotenvLine(trimmed: string, lineNumber: number): DotenvEntry | null {
  if (trimmed.length === 0 || trimmed.startsWith("#")) {
    return null;
  }

  const body = normalizeDotenvLineBody(trimmed);
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
  const assignment = splitDotenvAssignmentBody(line);
  return assignment?.rawKey ?? null;
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
  const assignment = splitDotenvAssignmentBody(normalizeDotenvLineBody(line.trim()));
  if (assignment === null) {
    return null;
  }
  return parseDotenvValuePortion(assignment.valuePortion);
}

function parseDotenvValuePortion(raw: string): string {
  const value = raw.trimStart();

  if (value.startsWith('"')) {
    return parseQuotedDotenvValue(value, '"');
  }
  if (value.startsWith("'")) {
    return parseQuotedDotenvValue(value, "'");
  }

  return stripUnquotedDotenvSuffix(value);
}

function parseQuotedDotenvValue(value: string, quote: '"' | "'"): string {
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] === quote) {
      return value.slice(1, index);
    }
  }

  return value.slice(1);
}

function stripUnquotedDotenvSuffix(value: string): string {
  let end = value.length;
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charAt(index);
    if (/\s/u.test(char)) {
      end = index;
      break;
    }
    if (char === "#" && (index === 0 || /\s/u.test(value.charAt(index - 1)))) {
      end = index;
      break;
    }
  }

  return value.slice(0, end).trimEnd();
}

function stripQuotes(value: string): string {
  return parseDotenvValuePortion(value);
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

function hasUrlEmbeddedCredentialsOrTokens(value: string): boolean {
  if (/^https?:\/\/[^/?#]+@[^/]/iu.test(value)) {
    return true;
  }

  try {
    const url = new URL(value);
    for (const name of url.searchParams.keys()) {
      if (/^(?:token|access_token|api[_-]?key|secret|password|auth|credentials?)$/iu.test(name)) {
        return true;
      }
    }
  } catch {
    return true;
  }

  return false;
}

function isPlainBenignUrl(value: string): boolean {
  if (!/^https?:\/\//iu.test(value) || hasKnownSecretPrefix(value)) {
    return false;
  }
  return !hasUrlEmbeddedCredentialsOrTokens(value);
}

/** Returns true when a dotenv value shape is obviously non-secret (metadata-only check). */
export function isObviouslyNonSecret(
  value: string,
  options?: { readonly suppressNumericBenign?: boolean },
): boolean {
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
  if (!options?.suppressNumericBenign && /^\d+$/u.test(value)) {
    return true;
  }
  return isPlainBenignUrl(value);
}
