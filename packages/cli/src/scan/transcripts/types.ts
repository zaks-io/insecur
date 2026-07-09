/** Agent tool that produced a transcript or log file. */
export type TranscriptProvider = "cursor" | "claude-code" | "codex" | "custom";

/** How a transcript exposure was detected. */
type TranscriptFindingKind = "candidate_match" | "heuristic_transcript_secret";

/** Confidence for transcript exposure findings. */
type TranscriptConfidence = "confirmed" | "high" | "medium";

/** Suggested next steps; the CLI does not execute these automatically. */
export type TranscriptNextStep =
  | "rotate_or_revoke"
  | "migrate_to_insecur"
  | "clean_local_transcripts"
  | "mark_false_positive"
  | "ignore";

export interface TranscriptFinding {
  readonly findingKind: TranscriptFindingKind;
  readonly provider: TranscriptProvider;
  readonly sourcePath: string;
  readonly sessionId?: string;
  readonly observedAt?: string;
  readonly detectorId: string;
  readonly confidence: TranscriptConfidence;
  /** Stable identifier derived only from finding metadata, never from the Sensitive Value. */
  readonly findingId: string;
  readonly candidateKey?: string;
  readonly candidateFile?: string;
  readonly nextSteps: readonly TranscriptNextStep[];
}

export interface TranscriptScanWarning {
  readonly code: string;
  readonly message: string;
  readonly sourcePath?: string;
}

export interface TranscriptScanSummary {
  readonly transcriptsScanned: number;
  readonly transcriptsUnreadable: number;
  readonly transcriptsOversized: number;
  readonly candidateCount: number;
  readonly exposureCount: number;
  readonly confirmedCount: number;
  readonly heuristicCount: number;
  readonly limitReached: boolean;
  readonly elapsedMs: number;
}

export interface TranscriptScanReport {
  readonly findings: readonly TranscriptFinding[];
  readonly warnings: readonly TranscriptScanWarning[];
  readonly summary: TranscriptScanSummary;
}

export interface TranscriptScanOptions {
  readonly rootDir: string;
  readonly homeDir?: string;
  readonly transcriptPaths?: readonly string[];
  readonly transcriptGlobs?: readonly string[];
  readonly maxTranscriptFiles?: number;
  readonly maxTranscriptBytes?: number;
}

/** In-memory project secret candidate; never serialized to output. */
export interface ProjectSecretCandidate {
  readonly key: string;
  readonly value: string;
  readonly file: string;
  readonly migratable: boolean;
}

export interface CollectedTranscriptFile {
  readonly absolutePath: string;
  readonly provider: TranscriptProvider;
  readonly sessionId?: string;
  readonly observedAt?: string;
}
