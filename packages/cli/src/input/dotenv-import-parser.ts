import { extractDotenvValue } from "../scan/dotenv-parser.js";

const DOTENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;

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

function parseDotenvImportLine(
  trimmed: string,
  lineNumber: number,
): DotenvImportEntry | DotenvImportParseIssue | null {
  if (trimmed.length === 0 || trimmed.startsWith("#")) {
    return null;
  }

  const body = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length).trimStart()
    : trimmed;
  const eqIndex = body.indexOf("=");
  if (eqIndex <= 0) {
    return { lineNumber, code: "import.parse_error" };
  }

  const rawKey = body.slice(0, eqIndex).trim();
  if (rawKey.length === 0 || !DOTENV_KEY_PATTERN.test(rawKey)) {
    return { lineNumber, code: "import.parse_error" };
  }

  const valueText = extractDotenvValue(trimmed);
  if (valueText === null) {
    return { lineNumber, code: "import.parse_error" };
  }

  return {
    parsedKey: rawKey,
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
