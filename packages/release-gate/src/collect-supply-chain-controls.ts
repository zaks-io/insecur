import type {
  DependencyScanEvidence,
  ReleaseGateControl,
  SbomVulnerabilityEvidence,
  VerifyEvidence,
} from "./types.js";
import { blockedControl, missingControl, passedControl } from "./control-helpers.js";
import { asRecord, hasOneOf, readNumber, readString } from "./evidence-parsers.js";
import { evidencePath, parseJsonEvidence, readJsonFile } from "./read-evidence.js";
import { secretScanSummaryText, summarizeSecretScanEvidence } from "./summarize-secret-scan.js";

function parseVerifyEvidence(value: unknown): VerifyEvidence | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const status = hasOneOf(record, "status", ["passed", "failed"] as const);
  const command = readString(record, "command");
  const checkedAt = readString(record, "checked_at");
  if (!status || !command || !checkedAt) {
    return null;
  }

  const evidence: VerifyEvidence = { status, command, checked_at: checkedAt };
  const logRef = readString(record, "log_ref");
  if (logRef) {
    evidence.log_ref = logRef;
  }

  return evidence;
}

function parseDependencyScanEvidence(value: unknown): DependencyScanEvidence | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const status = hasOneOf(record, "status", ["passed", "failed", "skipped"] as const);
  const checkedAt = readString(record, "checked_at");
  if (!status || !checkedAt) {
    return null;
  }

  const evidence: DependencyScanEvidence = { status, checked_at: checkedAt };
  const reportRef = readString(record, "report_ref");
  const summary = readString(record, "summary");
  if (reportRef) {
    evidence.report_ref = reportRef;
  }
  if (summary) {
    evidence.summary = summary;
  }

  return evidence;
}

function parseSbomVulnerabilityEvidence(value: unknown): SbomVulnerabilityEvidence | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const status = hasOneOf(record, "status", ["passed", "failed"] as const);
  const checkedAt = readString(record, "checked_at");
  if (!status || !checkedAt || record.scanner !== "syft+grype") {
    return null;
  }

  const evidence: SbomVulnerabilityEvidence = {
    status,
    scanner: "syft+grype",
    checked_at: checkedAt,
  };

  const sbomRef = readString(record, "sbom_ref");
  const vulnerabilityCount = readNumber(record, "vulnerability_count");
  if (sbomRef) {
    evidence.sbom_ref = sbomRef;
  }
  if (vulnerabilityCount !== null) {
    evidence.vulnerability_count = vulnerabilityCount;
  }

  return evidence;
}

export function collectVerifyControl(evidenceDir: string): ReleaseGateControl {
  const relativePath = "verify.json";
  const docs = ["docs/build-tooling.md", "docs/security-runbooks-and-release-gates.md"];
  const evidence = parseJsonEvidence(evidencePath(evidenceDir, relativePath), parseVerifyEvidence);

  if (!evidence) {
    return missingControl(
      "supply_chain.verify",
      "pnpm verify evidence is missing.",
      docs,
      relativePath,
    );
  }

  const refs: ReleaseGateControl["evidence"] = [{ kind: "file", path: relativePath }];
  if (evidence.log_ref) {
    refs.push({ kind: "file", path: evidence.log_ref });
  }

  const input = {
    id: "supply_chain.verify",
    docs,
    evidence: refs,
    checkedAt: evidence.checked_at,
  };

  if (evidence.status === "failed") {
    return blockedControl({
      ...input,
      summary: `${evidence.command} failed.`,
    });
  }

  return passedControl({
    ...input,
    summary: `${evidence.command} passed.`,
  });
}

export function collectDependencyScanControl(evidenceDir: string): ReleaseGateControl {
  const relativePath = "supply-chain/dependency-scan.json";
  const docs = ["docs/build-tooling.md", ".github/workflows/ci.yml"];
  const evidence = parseJsonEvidence(
    evidencePath(evidenceDir, relativePath),
    parseDependencyScanEvidence,
  );

  if (!evidence) {
    return missingControl(
      "supply_chain.dependency_scan",
      "Dependency scan evidence is missing.",
      docs,
      relativePath,
    );
  }

  const refs: ReleaseGateControl["evidence"] = [{ kind: "file", path: relativePath }];
  if (evidence.report_ref) {
    refs.push({ kind: "file", path: evidence.report_ref });
  }

  const input = {
    id: "supply_chain.dependency_scan",
    docs,
    evidence: refs,
    checkedAt: evidence.checked_at,
  };

  if (evidence.status === "skipped") {
    return blockedControl({
      ...input,
      summary: evidence.summary ?? "Dependency scan is not enabled.",
    });
  }

  if (evidence.status === "failed") {
    return blockedControl({
      ...input,
      summary: evidence.summary ?? "Dependency scan failed.",
    });
  }

  return passedControl({
    ...input,
    summary: evidence.summary ?? "Dependency scan passed.",
  });
}

export function collectSecretScanControl(evidenceDir: string): ReleaseGateControl {
  const relativePath = "supply-chain/secret-scan.json";
  const docs = ["docs/build-tooling.md", ".gitleaks.toml"];
  const raw = readJsonFile(evidencePath(evidenceDir, relativePath));
  const evidence = raw ? summarizeSecretScanEvidence(raw) : null;

  if (!evidence) {
    return missingControl(
      "supply_chain.secret_scan",
      "Secret scan evidence is missing or includes disallowed secret material fields.",
      docs,
      relativePath,
    );
  }

  const refs: ReleaseGateControl["evidence"] = [{ kind: "file", path: relativePath }];
  if (evidence.report_ref) {
    refs.push({ kind: "file", path: evidence.report_ref });
  }

  const input = {
    id: "supply_chain.secret_scan",
    docs,
    evidence: refs,
    checkedAt: evidence.checked_at,
    summary: secretScanSummaryText(evidence),
  };

  if (evidence.status === "failed" || evidence.finding_count > 0) {
    return blockedControl(input);
  }

  return passedControl(input);
}

export function collectSbomVulnerabilityControl(evidenceDir: string): ReleaseGateControl {
  const relativePath = "supply-chain/sbom-vulnerability.json";
  const docs = ["docs/build-tooling.md", "scripts/ci/sbom-grype.sh"];
  const evidence = parseJsonEvidence(
    evidencePath(evidenceDir, relativePath),
    parseSbomVulnerabilityEvidence,
  );

  if (!evidence) {
    return missingControl(
      "supply_chain.sbom_vulnerability",
      "SBOM and vulnerability scan evidence is missing.",
      docs,
      relativePath,
    );
  }

  const refs: ReleaseGateControl["evidence"] = [{ kind: "file", path: relativePath }];
  if (evidence.sbom_ref) {
    refs.push({ kind: "file", path: evidence.sbom_ref });
  }

  const input = {
    id: "supply_chain.sbom_vulnerability",
    docs,
    evidence: refs,
    checkedAt: evidence.checked_at,
  };

  if (evidence.status === "failed") {
    const count = evidence.vulnerability_count ?? 0;
    return blockedControl({
      ...input,
      summary: `syft+grype failed with ${String(count)} vulnerabilities.`,
    });
  }

  return passedControl({
    ...input,
    summary: "syft+grype scan passed.",
  });
}
