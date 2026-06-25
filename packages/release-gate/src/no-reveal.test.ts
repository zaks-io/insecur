import { describe, expect, it } from "vitest";

import {
  assembleSecurityEvidenceBundle,
  assertBundleIsMetadataSafe,
  bundleContainsSensitiveMaterial,
  summarizeSecretScanEvidence,
} from "./index.js";

/** Build a GitHub-PAT-shaped probe at runtime so no token-shaped literal is committed. */
function mintGithubPatShapeProbe(): string {
  return ["gh", "p_", "x".repeat(36)].join("");
}

describe("no-reveal bundle output", () => {
  it("summarizes secret scan evidence without retaining secret material fields", () => {
    const summary = summarizeSecretScanEvidence({
      status: "failed",
      scanner: "gitleaks",
      checked_at: "2026-06-25T00:00:00.000Z",
      finding_count: 1,
      findings: [{ RuleID: "generic-api-key" }],
    });

    expect(summary).toEqual({
      status: "failed",
      scanner: "gitleaks",
      checked_at: "2026-06-25T00:00:00.000Z",
      finding_count: 1,
      rule_ids: ["generic-api-key"],
    });
  });

  it("rejects secret scan evidence that includes secret material keys", () => {
    const summary = summarizeSecretScanEvidence({
      status: "failed",
      scanner: "gitleaks",
      checked_at: "2026-06-25T00:00:00.000Z",
      finding_count: 1,
      findings: [{ RuleID: "generic-api-key", secret: "metadata-only-reject-key" }],
    });

    expect(summary).toBeNull();
  });

  it("flags bundles that contain sensitive-looking strings", () => {
    const bundle = assembleSecurityEvidenceBundle({
      evidenceDir: "/tmp/unused",
      generatedAt: "2026-06-25T00:00:00.000Z",
    });

    const firstControl = bundle.controls[0];
    if (!firstControl) {
      throw new Error("expected at least one control");
    }

    bundle.controls[0] = {
      ...firstControl,
      summary: `leaked ${mintGithubPatShapeProbe()}`,
    };

    expect(bundleContainsSensitiveMaterial(bundle)).toBe(true);
    expect(() => {
      assertBundleIsMetadataSafe(bundle);
    }).toThrow(/metadata-safe/);
  });

  it("serializes bundles without forbidden secret-scan keys", () => {
    const bundle = assembleSecurityEvidenceBundle({
      evidenceDir: "/tmp/unused",
      generatedAt: "2026-06-25T00:00:00.000Z",
    });

    const serialized = JSON.stringify(bundle);

    expect(serialized).not.toMatch(/"secret"/i);
    expect(serialized).not.toMatch(/"match"/i);
    expect(serialized).not.toMatch(/"password"/i);
    expect(serialized).not.toMatch(/ghp_/);
  });
});
