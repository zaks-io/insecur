import { access, glob } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import {
  inferTranscriptProvider,
  parseTranscriptMetadata,
  relativeDiscoveryPattern,
  resolveDiscoveryRoots,
  type DiscoveryRoots,
} from "./metadata.js";
import type { CollectedTranscriptFile, TranscriptProvider } from "./types.js";

const DEFAULT_MAX_TRANSCRIPT_FILES = 500;

export interface CollectTranscriptFilesOptions {
  readonly homeDir?: string;
  readonly transcriptPaths?: readonly string[];
  readonly transcriptGlobs?: readonly string[];
  readonly maxTranscriptFiles?: number;
}

export interface TranscriptDiscoveryInputOptions {
  readonly homeDir?: string;
  readonly transcriptPaths?: readonly string[];
  readonly transcriptGlobs?: readonly string[];
  readonly maxTranscriptFiles?: number;
}

export interface CollectTranscriptFilesResult {
  readonly files: readonly CollectedTranscriptFile[];
  readonly warnings: readonly { code: string; message: string; sourcePath?: string }[];
  readonly limitReached: boolean;
}

interface CollectState {
  files: CollectedTranscriptFile[];
  seen: Set<string>;
  limitReached: boolean;
  maxFiles: number;
  warnings: { code: string; message: string; sourcePath?: string }[];
}

async function pathExists(absolutePath: string): Promise<boolean> {
  try {
    await access(absolutePath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function toCollectedFile(absolutePath: string, roots: DiscoveryRoots): CollectedTranscriptFile {
  const provider = inferTranscriptProvider(absolutePath, roots);
  return {
    absolutePath,
    provider,
    ...parseTranscriptMetadata(absolutePath, provider),
  };
}

function addCollectedFile(state: CollectState, absolutePath: string, roots: DiscoveryRoots): void {
  if (state.seen.has(absolutePath)) {
    return;
  }
  state.seen.add(absolutePath);
  state.files.push(toCollectedFile(absolutePath, roots));
  if (state.files.length >= state.maxFiles) {
    state.limitReached = true;
  }
}

async function collectFromGlobPattern(
  pattern: string,
  roots: DiscoveryRoots,
  state: CollectState,
  options: { readonly reportInvalidPattern: boolean },
): Promise<void> {
  try {
    for await (const match of glob(pattern)) {
      addCollectedFile(state, resolve(match), roots);
      if (state.limitReached) {
        break;
      }
    }
  } catch {
    if (options.reportInvalidPattern) {
      state.warnings.push({
        code: "transcript.glob_invalid",
        message: "Explicit transcript glob pattern is invalid.",
        sourcePath: pattern,
      });
    }
  }
}

function providerRootPath(provider: TranscriptProvider, roots: DiscoveryRoots): string {
  if (provider === "cursor") {
    return roots.cursorRoot;
  }
  if (provider === "claude-code") {
    return roots.claudeRoot;
  }
  return roots.codexRoot;
}

async function collectAutoDiscovered(roots: DiscoveryRoots, state: CollectState): Promise<void> {
  const providers: TranscriptProvider[] = ["cursor", "claude-code", "codex"];
  for (const provider of providers) {
    const rootPath = providerRootPath(provider, roots);
    if (!(await pathExists(rootPath))) {
      state.warnings.push({
        code: "transcript.discovery_path_missing",
        message: `No readable ${provider} transcript directory at the default location.`,
        sourcePath: rootPath,
      });
      continue;
    }

    for (const pattern of relativeDiscoveryPattern(provider, roots)) {
      await collectFromGlobPattern(pattern, roots, state, { reportInvalidPattern: false });
      if (state.limitReached) {
        return;
      }
    }
  }
}

async function collectExplicitPaths(
  paths: readonly string[],
  roots: DiscoveryRoots,
  state: CollectState,
): Promise<void> {
  for (const rawPath of paths) {
    if (state.limitReached) {
      break;
    }
    const absolutePath = isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath);
    if (state.seen.has(absolutePath)) {
      continue;
    }
    if (!(await pathExists(absolutePath))) {
      state.warnings.push({
        code: "transcript.path_unreadable",
        message: "Explicit transcript path is missing or unreadable.",
        sourcePath: absolutePath,
      });
      continue;
    }
    addCollectedFile(state, absolutePath, roots);
  }
}

async function collectGlobPatterns(
  patterns: readonly string[],
  roots: DiscoveryRoots,
  state: CollectState,
): Promise<void> {
  for (const pattern of patterns) {
    if (state.limitReached) {
      break;
    }
    await collectFromGlobPattern(pattern, roots, state, { reportInvalidPattern: true });
  }
}

export async function collectTranscriptFiles(
  options: CollectTranscriptFilesOptions = {},
): Promise<CollectTranscriptFilesResult> {
  const roots = resolveDiscoveryRoots(options.homeDir ?? homedir());
  const state = createCollectState(options.maxTranscriptFiles);

  await collectExplicitPaths(options.transcriptPaths ?? [], roots, state);
  await collectGlobPatterns(options.transcriptGlobs ?? [], roots, state);

  if (!hasExplicitTranscriptInput(options)) {
    await collectAutoDiscovered(roots, state);
  }

  return {
    files: state.files,
    warnings: state.warnings,
    limitReached: state.limitReached,
  };
}

export function transcriptDiscoveryInput(
  options: TranscriptDiscoveryInputOptions,
): CollectTranscriptFilesOptions {
  const input: {
    homeDir?: string;
    transcriptPaths?: readonly string[];
    transcriptGlobs?: readonly string[];
    maxTranscriptFiles?: number;
  } = {};
  if (options.homeDir !== undefined) {
    input.homeDir = options.homeDir;
  }
  if (options.transcriptPaths !== undefined) {
    input.transcriptPaths = options.transcriptPaths;
  }
  if (options.transcriptGlobs !== undefined) {
    input.transcriptGlobs = options.transcriptGlobs;
  }
  if (options.maxTranscriptFiles !== undefined) {
    input.maxTranscriptFiles = options.maxTranscriptFiles;
  }
  return input;
}

function createCollectState(maxTranscriptFiles?: number): CollectState {
  return {
    files: [],
    seen: new Set<string>(),
    limitReached: false,
    maxFiles: maxTranscriptFiles ?? DEFAULT_MAX_TRANSCRIPT_FILES,
    warnings: [],
  };
}

function hasExplicitTranscriptInput(options: CollectTranscriptFilesOptions): boolean {
  return (options.transcriptPaths?.length ?? 0) > 0 || (options.transcriptGlobs?.length ?? 0) > 0;
}
