import { readFile, stat } from "node:fs/promises";
import { collectProjectSecretCandidates } from "./candidates.js";
import { collectTranscriptFiles } from "./discovery.js";
import { describeHeuristicHit, findCandidateMatches, findHeuristicSecrets } from "./heuristics.js";
import { fingerprintSecretValue, redactValueShape } from "./fingerprint.js";
import type {
  CollectedTranscriptFile,
  ProjectSecretCandidate,
  TranscriptFinding,
  TranscriptNextStep,
  TranscriptScanOptions,
  TranscriptScanReport,
  TranscriptScanSummary,
  TranscriptScanWarning,
} from "./types.js";

const DEFAULT_MAX_TRANSCRIPT_BYTES = 10 * 1024 * 1024;

interface ReadTranscriptResult {
  readonly content: string | null;
  readonly unreadable: boolean;
  readonly oversized: boolean;
}

interface ScanTranscriptFilesState {
  findings: TranscriptFinding[];
  warnings: TranscriptScanWarning[];
  transcriptsScanned: number;
  transcriptsUnreadable: number;
  transcriptsOversized: number;
}

async function readTranscriptFile(
  absolutePath: string,
  maxBytes: number,
): Promise<ReadTranscriptResult> {
  try {
    const fileStat = await stat(absolutePath);
    if (fileStat.size > maxBytes) {
      return { content: null, unreadable: false, oversized: true };
    }
    const buffer = await readFile(absolutePath);
    return { content: buffer.toString("utf8"), unreadable: false, oversized: false };
  } catch {
    return { content: null, unreadable: true, oversized: false };
  }
}

function defaultNextSteps(candidate?: ProjectSecretCandidate): readonly TranscriptNextStep[] {
  const steps: TranscriptNextStep[] = ["rotate_or_revoke", "clean_local_transcripts"];
  if (candidate?.migratable) {
    steps.push("migrate_to_insecur");
  }
  steps.push("mark_false_positive", "ignore");
  return steps;
}

function toCandidateFinding(
  file: CollectedTranscriptFile,
  candidate: ProjectSecretCandidate,
): TranscriptFinding {
  return {
    findingKind: "candidate_match",
    provider: file.provider,
    sourcePath: file.absolutePath,
    ...(file.sessionId ? { sessionId: file.sessionId } : {}),
    ...(file.observedAt ? { observedAt: file.observedAt } : {}),
    detectorId: "project.candidate_match",
    confidence: "confirmed",
    valueShape: redactValueShape(candidate.value),
    valueFingerprint: fingerprintSecretValue(candidate.value),
    candidateKey: candidate.key,
    candidateFile: candidate.file,
    nextSteps: defaultNextSteps(candidate),
  };
}

function toHeuristicFinding(
  file: CollectedTranscriptFile,
  hit: ReturnType<typeof findHeuristicSecrets>[number],
): TranscriptFinding {
  const described = describeHeuristicHit(hit);
  return {
    findingKind: "heuristic_transcript_secret",
    provider: file.provider,
    sourcePath: file.absolutePath,
    ...(file.sessionId ? { sessionId: file.sessionId } : {}),
    ...(file.observedAt ? { observedAt: file.observedAt } : {}),
    detectorId: hit.detectorId,
    confidence: hit.confidence,
    valueShape: described.valueShape,
    valueFingerprint: described.valueFingerprint,
    nextSteps: defaultNextSteps(),
  };
}

function scanTranscriptContent(
  file: CollectedTranscriptFile,
  content: string,
  candidates: readonly ProjectSecretCandidate[],
  candidateFingerprints: ReadonlySet<string>,
): TranscriptFinding[] {
  const findings: TranscriptFinding[] = [];

  for (const match of findCandidateMatches(content, candidates)) {
    findings.push(toCandidateFinding(file, match.candidate));
  }

  for (const hit of findHeuristicSecrets(content)) {
    if (candidateFingerprints.has(fingerprintSecretValue(hit.value))) {
      continue;
    }
    findings.push(toHeuristicFinding(file, hit));
  }

  return dedupeFindings(findings);
}

function dedupeFindings(findings: readonly TranscriptFinding[]): TranscriptFinding[] {
  const seen = new Set<string>();
  const deduped: TranscriptFinding[] = [];
  for (const finding of findings) {
    const identity = [
      finding.findingKind,
      finding.sourcePath,
      finding.detectorId,
      finding.valueFingerprint,
      finding.candidateKey ?? "",
      finding.candidateFile ?? "",
    ].join("\0");
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    deduped.push(finding);
  }
  return deduped;
}

interface ScanCollectedTranscriptFilesInput {
  readonly files: readonly CollectedTranscriptFile[];
  readonly candidates: readonly ProjectSecretCandidate[];
  readonly candidateFingerprints: ReadonlySet<string>;
  readonly maxBytes: number;
  readonly initialWarnings: readonly TranscriptScanWarning[];
}

interface BuildTranscriptScanSummaryInput {
  readonly findings: readonly TranscriptFinding[];
  readonly state: ScanTranscriptFilesState;
  readonly candidateCount: number;
  readonly limitReached: boolean;
  readonly startedAt: number;
}

function buildTranscriptScanSummary(input: BuildTranscriptScanSummaryInput): TranscriptScanSummary {
  const { findings, state, candidateCount, limitReached, startedAt } = input;
  return {
    transcriptsScanned: state.transcriptsScanned,
    transcriptsUnreadable: state.transcriptsUnreadable,
    transcriptsOversized: state.transcriptsOversized,
    candidateCount,
    exposureCount: findings.length,
    confirmedCount: findings.filter((finding) => finding.findingKind === "candidate_match").length,
    heuristicCount: findings.filter(
      (finding) => finding.findingKind === "heuristic_transcript_secret",
    ).length,
    limitReached,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}

async function scanCollectedTranscriptFiles(
  input: ScanCollectedTranscriptFilesInput,
): Promise<ScanTranscriptFilesState> {
  const state: ScanTranscriptFilesState = {
    findings: [],
    warnings: [...input.initialWarnings],
    transcriptsScanned: 0,
    transcriptsUnreadable: 0,
    transcriptsOversized: 0,
  };

  for (const file of input.files) {
    const readResult = await readTranscriptFile(file.absolutePath, input.maxBytes);
    if (readResult.unreadable) {
      state.transcriptsUnreadable += 1;
      state.warnings.push({
        code: "transcript.file_unreadable",
        message: "Transcript file is missing or unreadable.",
        sourcePath: file.absolutePath,
      });
      continue;
    }
    if (readResult.oversized || readResult.content === null) {
      state.transcriptsOversized += 1;
      state.warnings.push({
        code: "transcript.file_oversized",
        message: "Transcript file exceeded the size guard and was skipped.",
        sourcePath: file.absolutePath,
      });
      continue;
    }

    state.transcriptsScanned += 1;
    state.findings.push(
      ...scanTranscriptContent(
        file,
        readResult.content,
        input.candidates,
        input.candidateFingerprints,
      ),
    );
  }

  return state;
}

export async function buildTranscriptScanReport(
  options: TranscriptScanOptions,
): Promise<TranscriptScanReport> {
  const startedAt = performance.now();
  const maxBytes = options.maxTranscriptBytes ?? DEFAULT_MAX_TRANSCRIPT_BYTES;

  const [candidates, collected] = await Promise.all([
    collectProjectSecretCandidates(options.rootDir),
    collectTranscriptFiles({
      ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
      ...(options.transcriptPaths !== undefined
        ? { transcriptPaths: options.transcriptPaths }
        : {}),
      ...(options.transcriptGlobs !== undefined
        ? { transcriptGlobs: options.transcriptGlobs }
        : {}),
      ...(options.maxTranscriptFiles !== undefined
        ? { maxTranscriptFiles: options.maxTranscriptFiles }
        : {}),
    }),
  ]);

  const candidateFingerprints = new Set(
    candidates.map((candidate) => fingerprintSecretValue(candidate.value)),
  );
  const scanned = await scanCollectedTranscriptFiles({
    files: collected.files,
    candidates,
    candidateFingerprints,
    maxBytes,
    initialWarnings: collected.warnings,
  });
  const findings = dedupeFindings(scanned.findings);

  return {
    findings,
    warnings: scanned.warnings,
    summary: buildTranscriptScanSummary({
      findings,
      state: scanned,
      candidateCount: candidates.length,
      limitReached: collected.limitReached,
      startedAt,
    }),
  };
}
