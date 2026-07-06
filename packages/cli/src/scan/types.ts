/** Confidence that a finding is a secret-bearing entry. */
export type ScanConfidence = "likely-secret" | "possible";

/** Kind of secret-bearing artifact detected. */
export type ScanFindingKind =
  | "dotenv-entry"
  | "private-key-file"
  | "credential-json"
  | "auth-token-file"
  | "netrc-file";

export interface ScanFinding {
  readonly file: string;
  readonly key: string;
  readonly kind: ScanFindingKind;
  readonly confidence: ScanConfidence;
  readonly migratable: boolean;
  readonly reason?: string;
  readonly remediation?: string;
}

interface ScanSummary {
  readonly filesScanned: number;
  readonly filesWithFindings: number;
  readonly unreadableFiles: readonly string[];
  readonly totalEntries: number;
  readonly likelySecrets: number;
  readonly migratableCount: number;
  readonly elapsedMs: number;
}

export interface ScanReport {
  readonly findings: readonly ScanFinding[];
  readonly summary: ScanSummary;
}

export interface ScanOptions {
  readonly rootDir: string;
  readonly maxDepth?: number;
  readonly maxFiles?: number;
  readonly maxFileBytes?: number;
}
