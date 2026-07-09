import { isAbsolute, join, sep } from "node:path";
import { collectTranscriptFiles, transcriptDiscoveryInput } from "../transcripts/discovery.js";
import {
  DEFAULT_MAX_TRANSCRIPT_BYTES,
  readTranscriptFileWithLimit,
} from "../transcripts/file-read.js";
import { resolveDiscoveryRoots, type DiscoveryRoots } from "../transcripts/metadata.js";
import type { CollectedTranscriptFile } from "../transcripts/types.js";
import type {
  AgentProjectScanOptions,
  AgentProjectScanWarning,
  TranscriptPathCollection,
} from "./types.js";
import { resolveClaudeEncodedProjectPath } from "./claude-project-path.js";

const DEFAULT_MAX_PATH_CANDIDATES = 1_000;

interface CollectState {
  readonly paths: Set<string>;
  readonly warnings: AgentProjectScanWarning[];
  transcriptsScanned: number;
  transcriptsUnreadable: number;
  transcriptsOversized: number;
  pathLimitReached: boolean;
}

function trimPathCandidate(candidate: string): string {
  let trimmed = candidate
    .replace(/\\n.*$/u, "")
    .replace(/:\d+(?::\d+)?$/u, "")
    .replace(/[),.;!?'"]+$/u, "");

  while (trimmed.length > 1 && trimmed.endsWith(sep)) {
    trimmed = trimmed.slice(0, -1);
  }

  return trimmed;
}

function extractAbsolutePathCandidates(content: string): readonly string[] {
  const seen = new Set<string>();
  const matches = content.matchAll(/\/(?!\/)[A-Za-z0-9._~+@%=-][^\s"'`<>|{}[\]]*/gu);

  for (const match of matches) {
    const candidate = trimPathCandidate(match[0]);
    if (candidate.length > 1 && isAbsolute(candidate)) {
      seen.add(candidate);
    }
  }

  return [...seen];
}

async function inferClaudeProjectPath(
  file: CollectedTranscriptFile,
  roots: DiscoveryRoots,
): Promise<string | null> {
  if (file.provider !== "claude-code") {
    return null;
  }

  const prefix = `${join(roots.claudeRoot, "projects")}${sep}`;
  if (!file.absolutePath.startsWith(prefix)) {
    return null;
  }

  const encodedProject = file.absolutePath.slice(prefix.length).split(sep)[0];
  if (!encodedProject?.startsWith("-")) {
    return null;
  }

  return resolveClaudeEncodedProjectPath(encodedProject);
}

function addPath(state: CollectState, path: string, maxPathCandidates: number): void {
  state.paths.add(path);
  if (state.paths.size >= maxPathCandidates) {
    state.pathLimitReached = true;
  }
}

function addContentPaths(state: CollectState, content: string, maxPathCandidates: number): void {
  for (const candidate of extractAbsolutePathCandidates(content)) {
    addPath(state, candidate, maxPathCandidates);
    if (state.pathLimitReached) {
      return;
    }
  }
}

function addUnreadableTranscriptWarning(state: CollectState, file: CollectedTranscriptFile): void {
  state.transcriptsUnreadable += 1;
  state.warnings.push({
    code: "agent_project.transcript_unreadable",
    message: "Transcript file is missing or unreadable.",
    sourcePath: file.absolutePath,
  });
}

function addOversizedTranscriptWarning(state: CollectState, file: CollectedTranscriptFile): void {
  state.transcriptsOversized += 1;
  state.warnings.push({
    code: "agent_project.transcript_oversized",
    message: "Transcript file exceeded the size guard and was skipped.",
    sourcePath: file.absolutePath,
  });
}

async function collectFilePaths(input: {
  readonly file: CollectedTranscriptFile;
  readonly roots: DiscoveryRoots;
  readonly maxBytes: number;
  readonly maxPathCandidates: number;
  readonly state: CollectState;
}): Promise<void> {
  const inferredClaudePath = await inferClaudeProjectPath(input.file, input.roots);
  if (inferredClaudePath !== null) {
    addPath(input.state, inferredClaudePath, input.maxPathCandidates);
  }

  const readResult = await readTranscriptFileWithLimit(input.file.absolutePath, input.maxBytes);
  if (readResult.unreadable) {
    addUnreadableTranscriptWarning(input.state, input.file);
    return;
  }
  if (readResult.oversized || readResult.content === null) {
    addOversizedTranscriptWarning(input.state, input.file);
    return;
  }

  input.state.transcriptsScanned += 1;
  addContentPaths(input.state, readResult.content, input.maxPathCandidates);
}

export async function collectPathsFromTranscripts(
  options: AgentProjectScanOptions,
): Promise<TranscriptPathCollection> {
  const roots = resolveDiscoveryRoots(options.homeDir);
  const maxBytes = options.maxTranscriptBytes ?? DEFAULT_MAX_TRANSCRIPT_BYTES;
  const maxPathCandidates = options.maxPathCandidates ?? DEFAULT_MAX_PATH_CANDIDATES;
  const collected = await collectTranscriptFiles(transcriptDiscoveryInput(options));
  const state: CollectState = {
    paths: new Set<string>(),
    warnings: [...collected.warnings],
    transcriptsScanned: 0,
    transcriptsUnreadable: 0,
    transcriptsOversized: 0,
    pathLimitReached: false,
  };

  for (const file of collected.files) {
    await collectFilePaths({ file, roots, maxBytes, maxPathCandidates, state });
    if (state.pathLimitReached) {
      break;
    }
  }

  return {
    paths: [...state.paths],
    transcriptsScanned: state.transcriptsScanned,
    transcriptsUnreadable: state.transcriptsUnreadable,
    transcriptsOversized: state.transcriptsOversized,
    warnings: state.warnings,
    limitReached: collected.limitReached || state.pathLimitReached,
  };
}
