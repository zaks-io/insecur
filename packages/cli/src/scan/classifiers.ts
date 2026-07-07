import { basename } from "node:path";
import {
  classifyDotenvValueShape,
  extractDotenvValue,
  isObviouslyNonSecret,
  type DotenvEntry,
} from "./dotenv-parser.js";
import { detectSecretFileKindByName } from "./secret-paths.js";
import type { ScanConfidence, ScanFindingKind } from "./types.js";

const STRONG_KEY_PATTERNS = [
  /_SECRET$/iu,
  /_SECRETS$/iu,
  /_TOKEN$/iu,
  /_TOKENS$/iu,
  /_PASSWORD$/iu,
  /_PASSWD$/iu,
  /_PRIVATE_KEY$/iu,
  /_API_KEY$/iu,
  /_ACCESS_KEY$/iu,
  /_AUTH$/iu,
  /_CREDENTIAL$/iu,
  /_CREDENTIALS$/iu,
  /^SECRET_/iu,
  /^API_KEY$/iu,
  /^DATABASE_URL$/iu,
  /^PRIVATE_KEY$/iu,
];

const WEAK_KEY_PATTERNS = [/_KEY$/iu, /_PASS$/iu, /_PWD$/iu, /PASSWORD/iu, /SECRET/iu, /TOKEN/iu];

export interface ClassifiedDotenvEntry {
  readonly key: string;
  readonly confidence: ScanConfidence;
  readonly migratable: boolean;
  readonly reason?: string;
  readonly remediation?: string;
}

export function classifyDotenvKeyName(key: string): ScanConfidence | null {
  if (STRONG_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
    return "likely-secret";
  }
  if (WEAK_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
    return "possible";
  }
  return null;
}

function resolveDotenvConfidence(
  key: string,
  shape: ReturnType<typeof classifyDotenvValueShape>,
): ScanConfidence | null {
  const keyConfidence = classifyDotenvKeyName(key);
  if (shape.hasKnownPrefix) {
    return "likely-secret";
  }
  if (keyConfidence !== null) {
    return shape.length < 4 ? null : keyConfidence;
  }
  return shape.looksSecretLike ? "possible" : null;
}

export function classifyDotenvEntry(key: string, value: string): ClassifiedDotenvEntry | null {
  const shape = classifyDotenvValueShape(value);
  const confidence = resolveDotenvConfidence(key, shape);
  if (confidence === null) {
    return null;
  }
  const suppressNumericBenign =
    confidence === "likely-secret" && classifyDotenvKeyName(key) === "likely-secret";
  if (isObviouslyNonSecret(shape.unquoted, { suppressNumericBenign })) {
    return null;
  }

  return {
    key,
    confidence,
    migratable: true,
    remediation: `insecur secrets set ${key} --value-stdin`,
  };
}

export function classifyDotenvFile(
  relativePath: string,
  content: string,
  entries: readonly DotenvEntry[],
): readonly ClassifiedDotenvEntry[] {
  const lines = content.split(/\r?\n/u);
  const results: ClassifiedDotenvEntry[] = [];

  for (const entry of entries) {
    const line = lines[entry.lineNumber - 1];
    if (line === undefined) {
      continue;
    }
    const value = extractDotenvValue(line);
    if (value === null) {
      continue;
    }
    const classified = classifyDotenvEntry(entry.key, value);
    if (classified) {
      results.push(classified);
    }
  }

  return results;
}

export function detectSecretFileKind(
  relativePath: string,
  contentHead: string,
): ScanFindingKind | null {
  const name = basename(relativePath);
  const byName = detectSecretFileKindByName(name);
  if (byName === "auth-token-file") {
    return isAuthTokenFileContent(contentHead) ? byName : null;
  }
  if (byName) {
    return byName;
  }
  return isPemContent(contentHead) ? "private-key-file" : null;
}

export function classifyWholeFileFinding(
  relativePath: string,
  kind: ScanFindingKind,
): {
  readonly key: string;
  readonly confidence: ScanConfidence;
  readonly migratable: boolean;
  readonly reason?: string;
  readonly remediation?: string;
} {
  const fileKey = basename(relativePath);
  const reasons: Record<Exclude<ScanFindingKind, "dotenv-entry">, string> = {
    "private-key-file": "multi-line key file has no variable-key mapping",
    "credential-json": "credential JSON file has no single variable-key mapping",
    "netrc-file": "netrc file has no variable-key mapping",
    "auth-token-file": "auth token file has no variable-key mapping",
  };

  if (kind === "dotenv-entry") {
    throw new Error("dotenv-entry is not a whole-file finding");
  }

  return {
    key: fileKey,
    confidence: "likely-secret",
    migratable: false,
    reason: reasons[kind],
  };
}

function isPemContent(content: string): boolean {
  return /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/u.test(content);
}

function isAuthTokenFileContent(content: string): boolean {
  return content.includes("_authToken") || content.includes("npmAuthToken");
}
