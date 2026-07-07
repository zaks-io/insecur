import { classifyDotenvValueShape, isObviouslyNonSecret } from "../dotenv-parser.js";
import {
  fingerprintSecretValue,
  isComparableCandidateValue,
  redactValueShape,
} from "./fingerprint.js";
import type { ProjectSecretCandidate } from "./types.js";

export interface HeuristicSecretHit {
  readonly value: string;
  readonly detectorId: string;
  readonly confidence: "high" | "medium";
  readonly startIndex: number;
}

export interface CandidateMatch {
  readonly candidate: ProjectSecretCandidate;
  readonly startIndex: number;
}

const KNOWN_PREFIX_PATTERN =
  /\b(?:AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghu_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|ghr_[A-Za-z0-9]{20,}|sk-(?:(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}|[A-Za-z0-9]{20,})|xox[baprs]-[A-Za-z0-9-]{10,})\b/gu;

const DOTENV_ASSIGNMENT_PATTERN =
  /\b([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|KEY|AUTH|CREDENTIAL)[A-Z0-9_]*)\s*=\s*([^\s"'`,;}{]{8,})/gu;

const PEM_PATTERN =
  /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]{32,}?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/gu;

function pushUniqueHit(
  hits: HeuristicSecretHit[],
  occupied: Set<string>,
  hit: HeuristicSecretHit,
): void {
  const identity = `${String(hit.startIndex)}\0${fingerprintSecretValue(hit.value)}`;
  if (occupied.has(identity)) {
    return;
  }
  occupied.add(identity);
  hits.push(hit);
}

function matchStartIndex(match: RegExpMatchArray): number {
  return match.index ?? 0;
}

function collectPrefixHits(text: string, hits: HeuristicSecretHit[], occupied: Set<string>): void {
  for (const match of text.matchAll(KNOWN_PREFIX_PATTERN)) {
    const value = match[0];
    if (!value || !isComparableCandidateValue(value) || isObviouslyNonSecret(value)) {
      continue;
    }
    pushUniqueHit(hits, occupied, {
      value,
      detectorId: "transcript.heuristic.known_prefix",
      confidence: "high",
      startIndex: matchStartIndex(match),
    });
  }
}

function isDotenvAssignmentSecret(value: string): boolean {
  const shape = classifyDotenvValueShape(value);
  if (isObviouslyNonSecret(shape.unquoted)) {
    return false;
  }
  return shape.hasKnownPrefix || shape.looksSecretLike;
}

function collectDotenvAssignmentHits(
  text: string,
  hits: HeuristicSecretHit[],
  occupied: Set<string>,
): void {
  for (const match of text.matchAll(DOTENV_ASSIGNMENT_PATTERN)) {
    const value = match[2];
    if (!value || !isComparableCandidateValue(value) || !isDotenvAssignmentSecret(value)) {
      continue;
    }
    const shape = classifyDotenvValueShape(value);
    pushUniqueHit(hits, occupied, {
      value,
      detectorId: "transcript.heuristic.dotenv_assignment",
      confidence: shape.hasKnownPrefix ? "high" : "medium",
      startIndex: matchStartIndex(match),
    });
  }
}

function collectPemHits(text: string, hits: HeuristicSecretHit[], occupied: Set<string>): void {
  for (const match of text.matchAll(PEM_PATTERN)) {
    const value = match[0].trim();
    if (!isComparableCandidateValue(value)) {
      continue;
    }
    pushUniqueHit(hits, occupied, {
      value,
      detectorId: "transcript.heuristic.private_key_block",
      confidence: "high",
      startIndex: matchStartIndex(match),
    });
  }
}

export function findHeuristicSecrets(text: string): HeuristicSecretHit[] {
  const hits: HeuristicSecretHit[] = [];
  const occupied = new Set<string>();
  collectPrefixHits(text, hits, occupied);
  collectDotenvAssignmentHits(text, hits, occupied);
  collectPemHits(text, hits, occupied);
  return hits;
}

function findMatchesForCandidate(
  text: string,
  candidate: ProjectSecretCandidate,
  occupied: Set<string>,
): CandidateMatch[] {
  const matches: CandidateMatch[] = [];
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const index = text.indexOf(candidate.value, searchFrom);
    if (index < 0) {
      break;
    }
    const identity = `${candidate.file}\0${candidate.key}\0${String(index)}`;
    if (!occupied.has(identity)) {
      occupied.add(identity);
      matches.push({ candidate, startIndex: index });
    }
    searchFrom = index + candidate.value.length;
  }
  return matches;
}

export function findCandidateMatches(
  text: string,
  candidates: readonly ProjectSecretCandidate[],
): CandidateMatch[] {
  const matches: CandidateMatch[] = [];
  const occupied = new Set<string>();

  for (const candidate of candidates) {
    if (!isComparableCandidateValue(candidate.value)) {
      continue;
    }
    matches.push(...findMatchesForCandidate(text, candidate, occupied));
  }

  return matches;
}

export function describeHeuristicHit(hit: HeuristicSecretHit): {
  readonly valueShape: string;
  readonly valueFingerprint: string;
} {
  return {
    valueShape: redactValueShape(hit.value),
    valueFingerprint: fingerprintSecretValue(hit.value),
  };
}
