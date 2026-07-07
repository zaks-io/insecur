import { normalizeDotenvLineBody, splitDotenvAssignmentBody } from "./dotenv-line.js";

interface DotenvImportEntry {
  readonly parsedKey: string;
  readonly lineNumber: number;
  readonly valueUtf8: Uint8Array;
}

interface DotenvImportParseIssue {
  readonly lineNumber: number;
  readonly code: "import.parse_error";
}

export interface DotenvImportParseResult {
  readonly entries: readonly DotenvImportEntry[];
  readonly parseIssues: readonly DotenvImportParseIssue[];
}

function trailingPortionAllowed(rest: string): boolean {
  const trimmed = rest.trim();
  return trimmed.length === 0 || trimmed.startsWith("#");
}

function parseDoubleQuoteEscape(escaped: string): string | null {
  switch (escaped) {
    case '"':
      return '"';
    case "\\":
      return "\\";
    case "n":
      return "\n";
    case "r":
      return "\r";
    case "t":
      return "\t";
    default:
      return null;
  }
}

function appendDoubleQuoteEscape(
  value: string,
  startIndex: number,
): { readonly decoded: string; readonly nextIndex: number } | null {
  if (startIndex + 1 >= value.length) {
    return null;
  }
  const decoded = parseDoubleQuoteEscape(value.charAt(startIndex + 1));
  if (decoded === null) {
    return null;
  }
  return { decoded, nextIndex: startIndex + 1 };
}

function parseStrictDoubleQuotedValue(value: string): string | null {
  let result = "";
  for (let index = 1; index < value.length; index += 1) {
    const char = value.charAt(index);
    if (char === '"') {
      return trailingPortionAllowed(value.slice(index + 1)) ? result : null;
    }
    if (char !== "\\") {
      result += char;
      continue;
    }
    const escaped = appendDoubleQuoteEscape(value, index);
    if (escaped === null) {
      return null;
    }
    result += escaped.decoded;
    index = escaped.nextIndex;
  }

  return null;
}

function parseStrictSingleQuotedValue(value: string): string | null {
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] === "'") {
      if (!trailingPortionAllowed(value.slice(index + 1))) {
        return null;
      }
      return value.slice(1, index);
    }
  }

  return null;
}

function parseStrictUnquotedValue(value: string): string {
  const commentMatch = /\s+#/u.exec(value);
  const withoutComment =
    commentMatch?.index === undefined ? value : value.slice(0, commentMatch.index);
  return withoutComment.trimEnd();
}

/** Strict dotenv value extraction for one-way Secret Import (no silent truncation). */
function extractStrictDotenvValue(valuePortion: string): string | null {
  const value = valuePortion.trimStart();

  if (value.startsWith('"')) {
    return parseStrictDoubleQuotedValue(value);
  }
  if (value.startsWith("'")) {
    return parseStrictSingleQuotedValue(value);
  }

  return parseStrictUnquotedValue(value);
}

function parseDotenvImportLine(
  trimmed: string,
  lineNumber: number,
): DotenvImportEntry | DotenvImportParseIssue | null {
  if (trimmed.length === 0 || trimmed.startsWith("#")) {
    return null;
  }

  const assignment = splitDotenvAssignmentBody(normalizeDotenvLineBody(trimmed));
  if (assignment === null) {
    return { lineNumber, code: "import.parse_error" };
  }

  const valueText = extractStrictDotenvValue(assignment.valuePortion);
  if (valueText === null) {
    return { lineNumber, code: "import.parse_error" };
  }

  return {
    parsedKey: assignment.rawKey,
    lineNumber,
    valueUtf8: new TextEncoder().encode(valueText),
  };
}

/** Client-side dotenv parse for Secret Import. Values stay in memory and never leave this module. */
export function parseDotenvImportFile(contentUtf8: string): DotenvImportParseResult {
  const entries: DotenvImportEntry[] = [];
  const parseIssues: DotenvImportParseIssue[] = [];
  const lines = contentUtf8.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      continue;
    }
    const parsed = parseDotenvImportLine(line.trim(), index + 1);
    if (parsed === null) {
      continue;
    }
    if ("code" in parsed) {
      parseIssues.push(parsed);
      continue;
    }
    entries.push(parsed);
  }

  return { entries, parseIssues };
}
