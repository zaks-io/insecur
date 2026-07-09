import type { ScanFinding } from "../types.js";

export interface AgentProjectScanWarning {
  readonly code: string;
  readonly message: string;
  readonly sourcePath?: string;
}

interface AgentProjectScanSummary {
  readonly transcriptsScanned: number;
  readonly transcriptsUnreadable: number;
  readonly transcriptsOversized: number;
  readonly candidatePaths: number;
  readonly projectsDiscovered: number;
  readonly filesScanned: number;
  readonly filesWithFindings: number;
  readonly unreadableFiles: readonly string[];
  readonly oversizedFiles: readonly string[];
  readonly limitReached: boolean;
  readonly totalEntries: number;
  readonly likelySecrets: number;
  readonly migratableCount: number;
  readonly elapsedMs: number;
}

export interface AgentProjectScanReport {
  readonly findings: readonly ScanFinding[];
  readonly warnings: readonly AgentProjectScanWarning[];
  readonly projectRoots: readonly string[];
  readonly summary: AgentProjectScanSummary;
}

export interface AgentProjectScanOptions {
  readonly homeDir?: string;
  readonly transcriptPaths?: readonly string[];
  readonly transcriptGlobs?: readonly string[];
  readonly maxTranscriptFiles?: number;
  readonly maxTranscriptBytes?: number;
  readonly maxPathCandidates?: number;
}

export interface TranscriptPathCollection {
  readonly paths: readonly string[];
  readonly transcriptsScanned: number;
  readonly transcriptsUnreadable: number;
  readonly transcriptsOversized: number;
  readonly warnings: readonly AgentProjectScanWarning[];
  readonly limitReached: boolean;
}
