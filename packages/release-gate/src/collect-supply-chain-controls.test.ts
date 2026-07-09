import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  collectDependencyScanControl,
  collectSbomVulnerabilityControl,
  collectSecretScanControl,
  collectVerifyControl,
} from "./collect-supply-chain-controls.js";
import type { ReleaseGateControl } from "./types.js";

function tempEvidenceDir(): string {
  return mkdtempSync(join(tmpdir(), "insecur-release-gate-supply-chain-"));
}

function writeEvidence(evidenceDir: string, relativePath: string, payload: unknown): void {
  const absolutePath = join(evidenceDir, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function expectFileRefs(control: ReleaseGateControl, paths: string[]): void {
  expect(control.evidence).toEqual(paths.map((path) => ({ kind: "file", path })));
}

describe("collectVerifyControl", () => {
  it("passes verify evidence and carries the log reference", () => {
    const evidenceDir = tempEvidenceDir();
    writeEvidence(evidenceDir, "verify.json", {
      status: "passed",
      command: "pnpm verify",
      checked_at: "2026-07-08T00:00:00.000Z",
      log_ref: "ci-logs/verify.txt",
    });

    const control = collectVerifyControl(evidenceDir);
    expect(control).toMatchObject({
      id: "supply_chain.verify",
      status: "passed",
      blocking: false,
      summary: "pnpm verify passed.",
      checked_at: "2026-07-08T00:00:00.000Z",
    });
    expectFileRefs(control, ["verify.json", "ci-logs/verify.txt"]);
    expect(control.docs).toEqual([
      "docs/build-tooling.md",
      "docs/security-runbooks-and-release-gates.md",
    ]);
  });

  it("blocks failed verify evidence", () => {
    const evidenceDir = tempEvidenceDir();
    writeEvidence(evidenceDir, "verify.json", {
      status: "failed",
      command: "pnpm verify",
      checked_at: "2026-07-08T00:00:00.000Z",
    });

    const control = collectVerifyControl(evidenceDir);
    expect(control.status).toBe("blocked");
    expect(control.blocking).toBe(true);
    expect(control.summary).toBe("pnpm verify failed.");
    expect(control.blocking_reason).toBe("pnpm verify failed.");
    expectFileRefs(control, ["verify.json"]);
  });

  it.each([
    ["missing file", undefined],
    ["non-record", "nope"],
    ["unsupported status", { status: "skipped", command: "pnpm verify", checked_at: "now" }],
    ["missing command", { status: "passed", checked_at: "now" }],
    ["blank checked_at", { status: "passed", command: "pnpm verify", checked_at: "" }],
  ] as const)("returns missing evidence for malformed verify input: %s", (_label, payload) => {
    const evidenceDir = tempEvidenceDir();
    if (payload !== undefined) {
      writeEvidence(evidenceDir, "verify.json", payload);
    }

    const control = collectVerifyControl(evidenceDir);
    expect(control).toMatchObject({
      id: "supply_chain.verify",
      status: "missing_evidence",
      blocking: true,
      summary: "pnpm verify evidence is missing.",
    });
    expect(control.blocking_reason).toContain("verify.json");
    expectFileRefs(control, ["verify.json"]);
  });
});

describe("collectDependencyScanControl", () => {
  it("passes dependency-scan evidence and carries summary plus report reference", () => {
    const evidenceDir = tempEvidenceDir();
    writeEvidence(evidenceDir, "supply-chain/dependency-scan.json", {
      status: "passed",
      checked_at: "2026-07-08T00:00:00.000Z",
      summary: "Lockfile integrity check passed.",
      report_ref: "ci-artifacts/dependency-scan.json",
    });

    const control = collectDependencyScanControl(evidenceDir);
    expect(control).toMatchObject({
      id: "supply_chain.dependency_scan",
      status: "passed",
      blocking: false,
      summary: "Lockfile integrity check passed.",
      checked_at: "2026-07-08T00:00:00.000Z",
    });
    expectFileRefs(control, [
      "supply-chain/dependency-scan.json",
      "ci-artifacts/dependency-scan.json",
    ]);
    expect(control.docs).toEqual(["docs/build-tooling.md", ".github/workflows/ci.yml"]);
  });

  it("passes dependency-scan evidence with the default summary", () => {
    const evidenceDir = tempEvidenceDir();
    writeEvidence(evidenceDir, "supply-chain/dependency-scan.json", {
      status: "passed",
      checked_at: "2026-07-08T00:00:00.000Z",
    });

    const control = collectDependencyScanControl(evidenceDir);
    expect(control.status).toBe("passed");
    expect(control.summary).toBe("Dependency scan passed.");
    expectFileRefs(control, ["supply-chain/dependency-scan.json"]);
  });

  it("blocks failed dependency-scan evidence with a default summary", () => {
    const evidenceDir = tempEvidenceDir();
    writeEvidence(evidenceDir, "supply-chain/dependency-scan.json", {
      status: "failed",
      checked_at: "2026-07-08T00:00:00.000Z",
    });

    const control = collectDependencyScanControl(evidenceDir);
    expect(control.status).toBe("blocked");
    expect(control.summary).toBe("Dependency scan failed.");
    expect(control.blocking_reason).toBe("Dependency scan failed.");
    expectFileRefs(control, ["supply-chain/dependency-scan.json"]);
  });

  it("blocks skipped dependency-scan evidence with a default summary", () => {
    const evidenceDir = tempEvidenceDir();
    writeEvidence(evidenceDir, "supply-chain/dependency-scan.json", {
      status: "skipped",
      checked_at: "2026-07-08T00:00:00.000Z",
    });

    const control = collectDependencyScanControl(evidenceDir);
    expect(control.status).toBe("blocked");
    expect(control.summary).toBe("Dependency scan is not enabled.");
    expectFileRefs(control, ["supply-chain/dependency-scan.json"]);
  });

  it.each([
    ["missing file", undefined],
    ["non-record", 123],
    ["unsupported status", { status: "unknown", checked_at: "now" }],
    ["missing checked_at", { status: "passed" }],
  ] as const)("returns missing evidence for malformed dependency input: %s", (_label, payload) => {
    const evidenceDir = tempEvidenceDir();
    if (payload !== undefined) {
      writeEvidence(evidenceDir, "supply-chain/dependency-scan.json", payload);
    }

    const control = collectDependencyScanControl(evidenceDir);
    expect(control.status).toBe("missing_evidence");
    expect(control.id).toBe("supply_chain.dependency_scan");
    expect(control.summary).toBe("Dependency scan evidence is missing.");
    expect(control.blocking_reason).toContain("supply-chain/dependency-scan.json");
    expectFileRefs(control, ["supply-chain/dependency-scan.json"]);
  });
});

describe("collectSecretScanControl", () => {
  it("passes gitleaks evidence with zero findings", () => {
    const evidenceDir = tempEvidenceDir();
    writeEvidence(evidenceDir, "supply-chain/secret-scan.json", {
      status: "passed",
      scanner: "gitleaks",
      checked_at: "2026-07-08T00:00:00.000Z",
      finding_count: 0,
      report_ref: "ci-artifacts/gitleaks-summary.json",
    });

    const control = collectSecretScanControl(evidenceDir);
    expect(control).toMatchObject({
      id: "supply_chain.secret_scan",
      status: "passed",
      blocking: false,
      summary: "gitleaks passed; findings=0",
      checked_at: "2026-07-08T00:00:00.000Z",
    });
    expectFileRefs(control, [
      "supply-chain/secret-scan.json",
      "ci-artifacts/gitleaks-summary.json",
    ]);
    expect(control.docs).toEqual(["docs/build-tooling.md", ".gitleaks.toml"]);
  });

  it("blocks secret-scan evidence when findings are present", () => {
    const evidenceDir = tempEvidenceDir();
    writeEvidence(evidenceDir, "supply-chain/secret-scan.json", {
      status: "passed",
      scanner: "gitleaks",
      checked_at: "2026-07-08T00:00:00.000Z",
      findings: [{ RuleID: "zap" }, { rule_id: "generic-api-key" }],
    });

    const control = collectSecretScanControl(evidenceDir);
    expect(control.status).toBe("blocked");
    expect(control.summary).toBe("gitleaks passed; findings=2; rules=generic-api-key,zap");
    expect(control.blocking_reason).toBe(control.summary);
    expectFileRefs(control, ["supply-chain/secret-scan.json"]);
  });

  it("blocks failed secret-scan evidence even when no findings are counted", () => {
    const evidenceDir = tempEvidenceDir();
    writeEvidence(evidenceDir, "supply-chain/secret-scan.json", {
      status: "failed",
      scanner: "gitleaks",
      checked_at: "2026-07-08T00:00:00.000Z",
      finding_count: 0,
    });

    const control = collectSecretScanControl(evidenceDir);
    expect(control.status).toBe("blocked");
    expect(control.summary).toBe("gitleaks failed; findings=0");
    expect(control.blocking_reason).toBe("gitleaks failed; findings=0");
    expectFileRefs(control, ["supply-chain/secret-scan.json"]);
  });

  it.each([
    ["missing file", undefined],
    ["wrong scanner", { status: "passed", scanner: "other", checked_at: "now", finding_count: 0 }],
    [
      "negative count",
      { status: "passed", scanner: "gitleaks", checked_at: "now", finding_count: -1 },
    ],
    [
      "forbidden secret material",
      {
        status: "failed",
        scanner: "gitleaks",
        checked_at: "now",
        findings: [{ RuleID: "generic-api-key", Secret: "must-not-appear" }],
      },
    ],
  ] as const)("returns missing evidence for malformed secret scan input: %s", (_label, payload) => {
    const evidenceDir = tempEvidenceDir();
    if (payload !== undefined) {
      writeEvidence(evidenceDir, "supply-chain/secret-scan.json", payload);
    }

    const control = collectSecretScanControl(evidenceDir);
    expect(control.status).toBe("missing_evidence");
    expect(control.id).toBe("supply_chain.secret_scan");
    expect(control.summary).toBe(
      "Secret scan evidence is missing or includes disallowed secret material fields.",
    );
    expect(control.blocking_reason).toContain("supply-chain/secret-scan.json");
    expectFileRefs(control, ["supply-chain/secret-scan.json"]);
  });
});

describe("collectSbomVulnerabilityControl", () => {
  it("passes syft+grype evidence and carries the SBOM reference", () => {
    const evidenceDir = tempEvidenceDir();
    writeEvidence(evidenceDir, "supply-chain/sbom-vulnerability.json", {
      status: "passed",
      scanner: "syft+grype",
      checked_at: "2026-07-08T00:00:00.000Z",
      sbom_ref: "ci-artifacts/sbom.cyclonedx.json",
      vulnerability_count: 0,
    });

    const control = collectSbomVulnerabilityControl(evidenceDir);
    expect(control).toMatchObject({
      id: "supply_chain.sbom_vulnerability",
      status: "passed",
      blocking: false,
      summary: "syft+grype scan passed.",
      checked_at: "2026-07-08T00:00:00.000Z",
    });
    expectFileRefs(control, [
      "supply-chain/sbom-vulnerability.json",
      "ci-artifacts/sbom.cyclonedx.json",
    ]);
    expect(control.docs).toEqual(["docs/build-tooling.md", "scripts/ci/sbom-grype.sh"]);
  });

  it("blocks failed syft+grype evidence with the vulnerability count", () => {
    const evidenceDir = tempEvidenceDir();
    writeEvidence(evidenceDir, "supply-chain/sbom-vulnerability.json", {
      status: "failed",
      scanner: "syft+grype",
      checked_at: "2026-07-08T00:00:00.000Z",
      vulnerability_count: 7,
    });

    const control = collectSbomVulnerabilityControl(evidenceDir);
    expect(control.status).toBe("blocked");
    expect(control.summary).toBe("syft+grype failed with 7 vulnerabilities.");
    expect(control.blocking_reason).toBe("syft+grype failed with 7 vulnerabilities.");
    expectFileRefs(control, ["supply-chain/sbom-vulnerability.json"]);
  });

  it("defaults the failed syft+grype vulnerability count to zero when absent", () => {
    const evidenceDir = tempEvidenceDir();
    writeEvidence(evidenceDir, "supply-chain/sbom-vulnerability.json", {
      status: "failed",
      scanner: "syft+grype",
      checked_at: "2026-07-08T00:00:00.000Z",
    });

    const control = collectSbomVulnerabilityControl(evidenceDir);
    expect(control.summary).toBe("syft+grype failed with 0 vulnerabilities.");
    expectFileRefs(control, ["supply-chain/sbom-vulnerability.json"]);
  });

  it.each([
    ["missing file", undefined],
    ["non-record", "nope"],
    ["unsupported status", { status: "skipped", scanner: "syft+grype", checked_at: "now" }],
    ["wrong scanner", { status: "passed", scanner: "grype", checked_at: "now" }],
    ["missing checked_at", { status: "passed", scanner: "syft+grype" }],
  ] as const)("returns missing evidence for malformed sbom input: %s", (_label, payload) => {
    const evidenceDir = tempEvidenceDir();
    if (payload !== undefined) {
      writeEvidence(evidenceDir, "supply-chain/sbom-vulnerability.json", payload);
    }

    const control = collectSbomVulnerabilityControl(evidenceDir);
    expect(control.status).toBe("missing_evidence");
    expect(control.id).toBe("supply_chain.sbom_vulnerability");
    expect(control.summary).toBe("SBOM and vulnerability scan evidence is missing.");
    expect(control.blocking_reason).toContain("supply-chain/sbom-vulnerability.json");
    expectFileRefs(control, ["supply-chain/sbom-vulnerability.json"]);
  });
});
