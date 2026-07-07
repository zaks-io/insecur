import { readFile } from "node:fs/promises";
import {
  classifyDotenvEntry,
  classifyWholeFileFinding,
  detectSecretFileKind,
} from "../classifiers.js";
import { extractDotenvValue, parseDotenvKeys } from "../dotenv-parser.js";
import { mightBeSecretPath } from "../secret-paths.js";
import type { ScanFindingKind } from "../types.js";
import { walkProjectFiles, type WalkedFile } from "../walker.js";
import { isComparableCandidateValue } from "./fingerprint.js";
import type { ProjectSecretCandidate } from "./types.js";

async function readUtf8File(absolutePath: string): Promise<string | null> {
  try {
    const buffer = await readFile(absolutePath);
    return buffer.toString("utf8");
  } catch {
    return null;
  }
}

function pushDotenvCandidates(
  candidates: ProjectSecretCandidate[],
  relativePath: string,
  content: string,
): void {
  const lines = content.split(/\r?\n/u);
  for (const entry of parseDotenvKeys(content)) {
    const line = lines[entry.lineNumber - 1];
    if (line === undefined) {
      continue;
    }
    const value = extractDotenvValue(line);
    if (value === null) {
      continue;
    }
    const classified = classifyDotenvEntry(entry.key, value);
    if (!classified || !isComparableCandidateValue(value)) {
      continue;
    }
    candidates.push({
      key: entry.key,
      value,
      file: relativePath,
      migratable: classified.migratable,
    });
  }
}

function pushWholeFileCandidate(
  candidates: ProjectSecretCandidate[],
  relativePath: string,
  content: string,
  kind: ScanFindingKind,
): void {
  if (kind === "dotenv-entry") {
    return;
  }
  const trimmed = content.trim();
  if (!isComparableCandidateValue(trimmed)) {
    return;
  }
  const wholeFile = classifyWholeFileFinding(relativePath, kind);
  candidates.push({
    key: wholeFile.key,
    value: trimmed,
    file: relativePath,
    migratable: wholeFile.migratable,
  });
}

async function collectCandidatesFromFile(
  file: WalkedFile,
  candidates: ProjectSecretCandidate[],
): Promise<void> {
  if (!mightBeSecretPath(file.relativePath)) {
    return;
  }
  const content = await readUtf8File(file.absolutePath);
  if (content === null) {
    return;
  }

  const kind = detectSecretFileKind(file.relativePath, content);
  if (!kind) {
    return;
  }

  if (kind === "dotenv-entry") {
    pushDotenvCandidates(candidates, file.relativePath, content);
    return;
  }

  pushWholeFileCandidate(candidates, file.relativePath, content, kind);
}

function dedupeCandidates(candidates: readonly ProjectSecretCandidate[]): ProjectSecretCandidate[] {
  const seen = new Set<string>();
  const deduped: ProjectSecretCandidate[] = [];
  for (const candidate of candidates) {
    const identity = `${candidate.file}\0${candidate.key}\0${candidate.value}`;
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    deduped.push(candidate);
  }
  return deduped;
}

/**
 * Collects project secret values in process memory for transcript comparison.
 * Values are never returned from the public scan report.
 */
export async function collectProjectSecretCandidates(
  rootDir: string,
): Promise<ProjectSecretCandidate[]> {
  const { files: walkedFiles } = await walkProjectFiles({ rootDir });
  const candidates: ProjectSecretCandidate[] = [];

  for (const file of walkedFiles) {
    await collectCandidatesFromFile(file, candidates);
  }

  return dedupeCandidates(candidates);
}
