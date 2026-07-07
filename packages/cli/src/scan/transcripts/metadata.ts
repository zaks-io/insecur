import { homedir } from "node:os";
import { basename, join, sep } from "node:path";
import type { CollectedTranscriptFile, TranscriptProvider } from "./types.js";

const CURSOR_TRANSCRIPT_SEGMENTS = ["projects", "*", "agent-transcripts"] as const;
const CURSOR_TOOL_SEGMENTS = ["projects", "*", "agent-tools"] as const;
const CLAUDE_PROJECT_SEGMENTS = ["projects", "*"] as const;
const CODEX_SESSION_SEGMENTS = ["sessions"] as const;

export interface DiscoveryRoots {
  readonly homeDir: string;
  readonly cursorRoot: string;
  readonly claudeRoot: string;
  readonly codexRoot: string;
}

export function resolveDiscoveryRoots(homeDir: string = homedir()): DiscoveryRoots {
  return {
    homeDir,
    cursorRoot: join(homeDir, ".cursor"),
    claudeRoot: join(homeDir, ".claude"),
    codexRoot: join(homeDir, ".codex"),
  };
}

export function relativeDiscoveryPattern(
  provider: TranscriptProvider,
  roots: DiscoveryRoots,
): readonly string[] {
  switch (provider) {
    case "cursor":
      return [
        join(roots.cursorRoot, ...CURSOR_TRANSCRIPT_SEGMENTS, "**", "*.jsonl"),
        join(roots.cursorRoot, ...CURSOR_TOOL_SEGMENTS, "*.txt"),
      ];
    case "claude-code":
      return [join(roots.claudeRoot, ...CLAUDE_PROJECT_SEGMENTS, "**", "*.jsonl")];
    case "codex":
      return [join(roots.codexRoot, ...CODEX_SESSION_SEGMENTS, "**", "*.jsonl")];
    case "custom":
      return [];
  }
}

export function inferTranscriptProvider(
  absolutePath: string,
  roots: DiscoveryRoots,
): TranscriptProvider {
  if (isUnderProviderRoot(absolutePath, roots.cursorRoot)) {
    return "cursor";
  }
  if (isUnderProviderRoot(absolutePath, roots.claudeRoot)) {
    return "claude-code";
  }
  if (isUnderProviderRoot(absolutePath, roots.codexRoot)) {
    return "codex";
  }
  return "custom";
}

function isUnderProviderRoot(absolutePath: string, root: string): boolean {
  const normalizedPath =
    absolutePath.length > 1 && absolutePath.endsWith(sep)
      ? absolutePath.slice(0, -1)
      : absolutePath;
  const normalizedRoot = root.length > 1 && root.endsWith(sep) ? root.slice(0, -1) : root;

  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${sep}`);
}

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;

function parseCodexMetadata(
  fileName: string,
): Pick<CollectedTranscriptFile, "sessionId" | "observedAt"> {
  const rolloutMatch = /rollout-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-/iu.exec(fileName);
  const sessionMatch = UUID_PATTERN.exec(fileName);
  const observedAt = rolloutMatch?.[1]?.replace(/T(\d{2})-(\d{2})-(\d{2})/u, "T$1:$2:$3Z");
  if (sessionMatch && observedAt) {
    return { sessionId: sessionMatch[0], observedAt };
  }
  if (sessionMatch) {
    return { sessionId: sessionMatch[0] };
  }
  if (observedAt) {
    return { observedAt };
  }
  return {};
}

export function parseTranscriptMetadata(
  absolutePath: string,
  provider: TranscriptProvider,
): Pick<CollectedTranscriptFile, "sessionId" | "observedAt"> {
  const fileName = basename(absolutePath);
  if (provider === "codex") {
    return parseCodexMetadata(fileName);
  }

  const sessionMatch = UUID_PATTERN.exec(fileName.replace(/\.jsonl$/iu, ""));
  return sessionMatch ? { sessionId: sessionMatch[0] } : {};
}
