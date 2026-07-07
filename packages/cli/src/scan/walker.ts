import { readdir, realpath, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join, sep } from "node:path";
import { CliError } from "../output/cli-error.js";
import { EXIT_VALIDATION } from "../output/exit-codes.js";

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
  readonly unreadablePaths: readonly string[];
  readonly limitReached: boolean;
}

interface WalkState {
  readonly canonicalRoot: string;
  readonly maxDepth: number;
  readonly maxFiles: number;
  readonly maxFileBytes: number;
  readonly results: WalkedFile[];
  readonly oversizedFiles: string[];
  readonly unreadablePaths: string[];
  limitReached: boolean;
}

function markWalkLimitReached(state: WalkState): void {
  state.limitReached = true;
}

function isWithinScanRoot(resolvedPath: string, canonicalRoot: string): boolean {
  const normalizedResolved =
    resolvedPath.length > 1 && resolvedPath.endsWith(sep)
      ? resolvedPath.slice(0, -1)
      : resolvedPath;
  const normalizedRoot =
    canonicalRoot.length > 1 && canonicalRoot.endsWith(sep)
      ? canonicalRoot.slice(0, -1)
      : canonicalRoot;

  return (
    normalizedResolved === normalizedRoot ||
    normalizedResolved.startsWith(`${normalizedRoot}${sep}`)
  );
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
    markWalkLimitReached(state);
    return;
  }

  let sizeBytes: number;
  try {
    sizeBytes = (await stat(absolutePath)).size;
  } catch {
    state.unreadablePaths.push(relativePath);
    return;
  }

  if (sizeBytes <= state.maxFileBytes) {
    state.results.push({ absolutePath, relativePath, sizeBytes });
    return;
  }

  state.oversizedFiles.push(relativePath);
}

function markUnreadable(state: WalkState, entryRelative: string): void {
  state.unreadablePaths.push(entryRelative);
}

async function resolveSymlinkWithinRoot(
  state: WalkState,
  absolutePath: string,
  entryRelative: string,
): Promise<string | null> {
  try {
    const resolvedPath = await realpath(absolutePath);
    if (!isWithinScanRoot(resolvedPath, state.canonicalRoot)) {
      markUnreadable(state, entryRelative);
      return null;
    }
    return resolvedPath;
  } catch {
    markUnreadable(state, entryRelative);
    return null;
  }
}

function entryPaths(
  visit: DirVisit,
  entry: Dirent,
): { readonly entryRelative: string; readonly absolutePath: string } {
  const entryRelative =
    visit.relativeDir.length > 0 ? join(visit.relativeDir, entry.name) : entry.name;
  return {
    entryRelative,
    absolutePath: join(visit.dirPath, entry.name),
  };
}

async function followResolvedSymlinkTarget(
  state: WalkState,
  visit: DirVisit,
  entry: Dirent,
  resolvedPath: string,
): Promise<void> {
  const { entryRelative } = entryPaths(visit, entry);

  let entryStat;
  try {
    entryStat = await stat(resolvedPath);
  } catch {
    markUnreadable(state, entryRelative);
    return;
  }

  if (entryStat.isDirectory()) {
    if (!SKIP_DIR_NAMES.has(entry.name)) {
      await visitDir(state, {
        dirPath: resolvedPath,
        relativeDir: entryRelative,
        depth: visit.depth + 1,
      });
    }
    return;
  }

  if (entryStat.isFile()) {
    await tryAppendFile(state, resolvedPath, entryRelative);
    return;
  }

  markUnreadable(state, entryRelative);
}

async function processSymbolicLink(
  state: WalkState,
  visit: DirVisit,
  entry: Dirent,
): Promise<void> {
  const { entryRelative, absolutePath } = entryPaths(visit, entry);

  const resolvedPath = await resolveSymlinkWithinRoot(state, absolutePath, entryRelative);
  if (resolvedPath === null) {
    return;
  }

  await followResolvedSymlinkTarget(state, visit, entry, resolvedPath);
}

async function processEntry(state: WalkState, visit: DirVisit, entry: Dirent): Promise<void> {
  const entryRelative =
    visit.relativeDir.length > 0 ? join(visit.relativeDir, entry.name) : entry.name;
  const absolutePath = join(visit.dirPath, entry.name);

  if (entry.isSymbolicLink()) {
    await processSymbolicLink(state, visit, entry);
    return;
  }

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

function shouldStopWalkAtDir(state: WalkState, visit: DirVisit): boolean {
  if (visit.depth > state.maxDepth) {
    markWalkLimitReached(state);
    return true;
  }
  if (state.results.length >= state.maxFiles) {
    markWalkLimitReached(state);
    return true;
  }
  return false;
}

async function visitDir(state: WalkState, visit: DirVisit): Promise<void> {
  if (shouldStopWalkAtDir(state, visit)) {
    return;
  }

  let entries;
  try {
    entries = await readdir(visit.dirPath, { withFileTypes: true });
  } catch {
    const unreadablePath = visit.relativeDir.length > 0 ? visit.relativeDir : ".";
    state.unreadablePaths.push(unreadablePath);
    return;
  }

  for (const entry of entries) {
    if (state.results.length >= state.maxFiles) {
      markWalkLimitReached(state);
      break;
    }
    await processEntry(state, visit, entry);
  }
}

export async function walkProjectFiles(options: WalkOptions): Promise<WalkProjectFilesResult> {
  let canonicalRoot: string;
  try {
    canonicalRoot = await realpath(options.rootDir);
  } catch {
    throw new CliError(
      {
        code: "validation.invalid_command_input",
        message: "insecur scan could not resolve the project root directory.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
  const state: WalkState = {
    canonicalRoot,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxFiles: options.maxFiles ?? DEFAULT_MAX_FILES,
    maxFileBytes: options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
    results: [],
    oversizedFiles: [],
    unreadablePaths: [],
    limitReached: false,
  };

  await visitDir(state, { dirPath: canonicalRoot, relativeDir: "", depth: 0 });
  return {
    files: state.results,
    oversizedFiles: state.oversizedFiles,
    unreadablePaths: state.unreadablePaths,
    limitReached: state.limitReached,
  };
}
