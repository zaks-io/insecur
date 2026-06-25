import type { SecretScanEvidence } from "./types.js";
import { asRecord, readString } from "./evidence-parsers.js";

const FORBIDDEN_SECRET_SCAN_KEYS = new Set([
  "secret",
  "match",
  "line",
  "entropy",
  "fingerprint",
  "value",
  "content",
]);

type UnknownRecord = Record<string, unknown>;

function hasForbiddenKey(record: UnknownRecord): boolean {
  return Object.keys(record).some((key) => FORBIDDEN_SECRET_SCAN_KEYS.has(key.toLowerCase()));
}

function readRuleId(finding: UnknownRecord): string | null {
  const ruleId = finding.RuleID ?? finding.rule_id ?? finding.ruleId;
  return typeof ruleId === "string" && ruleId.length > 0 ? ruleId : null;
}

function readFindingCount(raw: UnknownRecord): number | null {
  if (typeof raw.finding_count === "number") {
    return raw.finding_count;
  }

  return Array.isArray(raw.findings) ? raw.findings.length : null;
}

function readRuleIdsFromFindings(findings: unknown[]): string[] | undefined {
  const ruleIds = new Set<string>();

  for (const finding of findings) {
    const record = asRecord(finding);
    if (!record || hasForbiddenKey(record)) {
      return undefined;
    }

    const ruleId = readRuleId(record);
    if (ruleId) {
      ruleIds.add(ruleId);
    }
  }

  const sorted = [...ruleIds].sort();
  return sorted.length > 0 ? sorted : undefined;
}

function readRuleIds(raw: UnknownRecord): string[] | undefined {
  if (Array.isArray(raw.findings)) {
    return readRuleIdsFromFindings(raw.findings);
  }

  if (!Array.isArray(raw.rule_ids)) {
    return undefined;
  }

  const ruleIds = raw.rule_ids.filter((ruleId): ruleId is string => typeof ruleId === "string");
  return ruleIds.length > 0 ? [...new Set(ruleIds)].sort() : undefined;
}

interface SecretScanBuildInput {
  record: UnknownRecord;
  status: "passed" | "failed";
  checkedAt: string;
  findingCount: number;
  ruleIds: string[] | undefined;
}

function buildSecretScanEvidence(input: SecretScanBuildInput): SecretScanEvidence {
  const summary: SecretScanEvidence = {
    status: input.status,
    scanner: "gitleaks",
    checked_at: input.checkedAt,
    finding_count: input.findingCount,
  };

  const reportRef = readString(input.record, "report_ref");
  if (reportRef) {
    summary.report_ref = reportRef;
  }
  if (input.ruleIds) {
    summary.rule_ids = input.ruleIds;
  }

  return summary;
}

function isSecretScanStatus(value: unknown): value is "passed" | "failed" {
  return value === "passed" || value === "failed";
}

function hasValidScanner(record: UnknownRecord): boolean {
  return record.scanner === undefined || record.scanner === "gitleaks";
}

function validateSecretScanRecord(record: UnknownRecord): {
  checkedAt: string;
  status: "passed" | "failed";
  findingCount: number;
  ruleIds: string[] | undefined;
} | null {
  const checkedAt = readString(record, "checked_at");
  if (!checkedAt || !isSecretScanStatus(record.status)) {
    return null;
  }

  const findingCount = readFindingCount(record);
  if (findingCount === null || findingCount < 0) {
    return null;
  }

  const ruleIds = readRuleIds(record);
  if (ruleIds === undefined && Array.isArray(record.findings)) {
    return null;
  }

  return { checkedAt, status: record.status, findingCount, ruleIds };
}

export function summarizeSecretScanEvidence(raw: unknown): SecretScanEvidence | null {
  const record = asRecord(raw);
  if (!record || hasForbiddenKey(record) || !hasValidScanner(record)) {
    return null;
  }

  const validated = validateSecretScanRecord(record);
  if (!validated) {
    return null;
  }

  return buildSecretScanEvidence({
    record,
    status: validated.status,
    checkedAt: validated.checkedAt,
    findingCount: validated.findingCount,
    ruleIds: validated.ruleIds,
  });
}

export function secretScanSummaryText(evidence: SecretScanEvidence): string {
  const rules =
    evidence.rule_ids && evidence.rule_ids.length > 0
      ? `; rules=${evidence.rule_ids.join(",")}`
      : "";

  return `gitleaks ${evidence.status}; findings=${String(evidence.finding_count)}${rules}`;
}
