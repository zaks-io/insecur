import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  classifyDotenvFile,
  classifyWholeFileFinding,
  detectSecretFileKind,
  type ClassifiedDotenvEntry,
} from "./classifiers.js";
import { parseDotenvKeys } from "./dotenv-parser.js";
import { mightBeSecretPath } from "./secret-paths.js";
import type { ScanFinding, ScanFindingKind, ScanFindingScope } from "./types.js";

interface ReadFileResult {
  readonly content: string | null;
  readonly unreadable: boolean;
}

async function readFileContent(absolutePath: string): Promise<ReadFileResult> {
  try {
    const buffer = await readFile(absolutePath);
    return { content: buffer.toString("utf8"), unreadable: false };
  } catch {
    return { content: null, unreadable: true };
  }
}

function toDotenvFinding(
  file: string,
  scope: ScanFindingScope,
  entry: ClassifiedDotenvEntry,
): ScanFinding {
  return {
    file,
    scope,
    key: entry.key,
    kind: "dotenv-entry",
    confidence: entry.confidence,
    migratable: entry.migratable,
    ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
    ...(entry.remediation !== undefined ? { remediation: entry.remediation } : {}),
  };
}

export function toWholeFileFinding(
  file: string,
  scope: ScanFindingScope,
  kind: ScanFindingKind,
  overrides?: { readonly reason?: string; readonly key?: string },
): ScanFinding {
  const wholeFile = classifyWholeFileFinding(file, kind);
  const reason = overrides?.reason ?? wholeFile.reason;
  return {
    file,
    scope,
    key: overrides?.key ?? wholeFile.key,
    kind,
    confidence: wholeFile.confidence,
    migratable: wholeFile.migratable,
    ...(reason !== undefined ? { reason } : {}),
    ...(wholeFile.remediation !== undefined ? { remediation: wholeFile.remediation } : {}),
  };
}

export interface ScanFileResult {
  readonly findings: readonly ScanFinding[];
  readonly entryCount: number;
  readonly unreadable: boolean;
  readonly skipped: boolean;
}

export async function scanFileAtPath(input: {
  readonly displayPath: string;
  readonly absolutePath: string;
  readonly scope: ScanFindingScope;
}): Promise<ScanFileResult> {
  const name = basename(input.displayPath);
  if (!mightBeSecretPath(name) && !mightBeSecretPath(input.displayPath)) {
    return { findings: [], entryCount: 0, unreadable: false, skipped: true };
  }

  const readResult = await readFileContent(input.absolutePath);
  if (readResult.unreadable || readResult.content === null) {
    return { findings: [], entryCount: 0, unreadable: true, skipped: false };
  }

  const kind = detectSecretFileKind(input.displayPath, readResult.content);
  if (!kind) {
    return { findings: [], entryCount: 0, unreadable: false, skipped: true };
  }

  if (kind === "dotenv-entry") {
    const entries = parseDotenvKeys(readResult.content);
    const classified = classifyDotenvFile(input.displayPath, readResult.content, entries);
    return {
      findings: classified.map((entry) => toDotenvFinding(input.displayPath, input.scope, entry)),
      entryCount: entries.length,
      unreadable: false,
      skipped: false,
    };
  }

  return {
    findings: [toWholeFileFinding(input.displayPath, input.scope, kind)],
    entryCount: 1,
    unreadable: false,
    skipped: false,
  };
}

export function shellRcFinding(
  displayPath: string,
  key: string,
  confidence: "likely-secret" | "possible",
): ScanFinding {
  return {
    file: displayPath,
    scope: "machine",
    key,
    kind: "dotenv-entry",
    confidence,
    migratable: true,
    remediation: `insecur secrets set ${key} --value-stdin`,
  };
}

export function awsCredentialsFinding(displayPath: string): ScanFinding {
  return {
    file: displayPath,
    scope: "machine",
    key: "credentials",
    kind: "credential-json",
    confidence: "likely-secret",
    migratable: false,
    reason: "AWS credentials file has no variable-key mapping in insecur today",
  };
}
