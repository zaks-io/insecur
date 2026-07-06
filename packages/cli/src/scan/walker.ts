import { readdir, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";

const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_FILES = 10_000;
const DEFAULT_MAX_FILE_BYTES = 256 * 1024;

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".nyc_output",
  ".cache",
  ".turbo",
  ".parcel-cache",
]);

export interface WalkedFile {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly sizeBytes: number;
}

export interface WalkOptions {
  readonly rootDir: string;
  readonly maxDepth?: number;
  readonly maxFiles?: number;
  readonly maxFileBytes?: number;
}

export interface WalkProjectFilesResult {
  readonly files: readonly WalkedFile[];
  readonly oversizedFiles: readonly string[];
}

interface WalkState {
  readonly maxDepth: number;
  readonly maxFiles: number;
  readonly maxFileBytes: number;
  readonly results: WalkedFile[];
  readonly oversizedFiles: string[];
}

interface DirVisit {
  readonly dirPath: string;
  readonly relativeDir: string;
  readonly depth: number;
}

async function tryAppendFile(
  state: WalkState,
  absolutePath: string,
  relativePath: string,
): Promise<void> {
  if (state.results.length >= state.maxFiles) {
    return;
  }

  let sizeBytes: number;
  try {
    sizeBytes = (await stat(absolutePath)).size;
  } catch {
    return;
  }

  if (sizeBytes <= state.maxFileBytes) {
    state.results.push({ absolutePath, relativePath, sizeBytes });
    return;
  }

  state.oversizedFiles.push(relativePath);
}

async function processEntry(state: WalkState, visit: DirVisit, entry: Dirent): Promise<void> {
  const entryRelative =
    visit.relativeDir.length > 0 ? join(visit.relativeDir, entry.name) : entry.name;
  const absolutePath = join(visit.dirPath, entry.name);

  if (entry.isDirectory()) {
    if (!SKIP_DIR_NAMES.has(entry.name)) {
      await visitDir(state, {
        dirPath: absolutePath,
        relativeDir: entryRelative,
        depth: visit.depth + 1,
      });
    }
    return;
  }

  if (entry.isFile()) {
    await tryAppendFile(state, absolutePath, entryRelative);
  }
}

async function visitDir(state: WalkState, visit: DirVisit): Promise<void> {
  if (visit.depth > state.maxDepth || state.results.length >= state.maxFiles) {
    return;
  }

  let entries;
  try {
    entries = await readdir(visit.dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (state.results.length >= state.maxFiles) {
      break;
    }
    await processEntry(state, visit, entry);
  }
}

export async function walkProjectFiles(options: WalkOptions): Promise<WalkProjectFilesResult> {
  const state: WalkState = {
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxFiles: options.maxFiles ?? DEFAULT_MAX_FILES,
    maxFileBytes: options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
    results: [],
    oversizedFiles: [],
  };

  await visitDir(state, { dirPath: options.rootDir, relativeDir: "", depth: 0 });
  return { files: state.results, oversizedFiles: state.oversizedFiles };
}
