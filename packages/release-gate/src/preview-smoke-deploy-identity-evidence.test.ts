import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertPreviewSmokeDeployIdentityEvidence,
  PREVIEW_SMOKE_DEPLOY_IDENTITY_SERVICES,
} from "./preview-smoke-deploy-identity-evidence.js";

const EXPECTED_SHA = "a".repeat(40);
const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const VERIFIER_COMMAND = "node";
const VERIFIER_ARGS = [
  "--import",
  "tsx/esm",
  "src/verify-preview-smoke-deploy-identity-evidence.ts",
];

function passingEvidence(): Record<string, unknown> {
  return {
    expected_sha: EXPECTED_SHA,
    post_suite: {
      checked_at: "2026-07-09T00:01:00.000Z",
      identities: passingIdentities(),
    },
    pre_suite: {
      checked_at: "2026-07-09T00:00:00.000Z",
      identities: passingIdentities(),
    },
    schema_version: 1,
  };
}

function passingIdentities(): { deploy_sha: string; matches_expected: boolean; service: string }[] {
  return PREVIEW_SMOKE_DEPLOY_IDENTITY_SERVICES.map((service) => ({
    deploy_sha: EXPECTED_SHA,
    matches_expected: true,
    service,
  }));
}

describe("preview smoke deploy identity evidence", () => {
  it("accepts complete matching pre- and post-suite checks", () => {
    expect(() => {
      assertPreviewSmokeDeployIdentityEvidence(passingEvidence(), EXPECTED_SHA);
    }).not.toThrow();
  });

  it("rejects a service identity changed during the smoke suite", () => {
    const evidence = passingEvidence();
    const postSuite = evidence.post_suite as { identities: { deploy_sha: string }[] };
    postSuite.identities = postSuite.identities.map((identity, index) =>
      index === 2 ? { ...identity, deploy_sha: "b".repeat(40) } : identity,
    );

    expect(() => {
      assertPreviewSmokeDeployIdentityEvidence(evidence, EXPECTED_SHA);
    }).toThrow(/post-suite deploy identity mismatched.*insecur-site/u);
  });

  it("rejects incomplete identity proof", () => {
    const evidence = passingEvidence();
    const preSuite = evidence.pre_suite as { identities: unknown[] };
    preSuite.identities.pop();

    expect(() => {
      assertPreviewSmokeDeployIdentityEvidence(evidence, EXPECTED_SHA);
    }).toThrow(/missing, incomplete, or invalid/u);
  });

  it("rejects identity proof with a non-SHA deploy identity", () => {
    const evidence = passingEvidence();
    const postSuite = evidence.post_suite as { identities: { deploy_sha: string }[] };
    const siteIdentity = postSuite.identities[2];
    if (!siteIdentity) {
      throw new Error("expected three identities in passing evidence");
    }
    postSuite.identities[2] = { ...siteIdentity, deploy_sha: "not-a-sha" };

    expect(() => {
      assertPreviewSmokeDeployIdentityEvidence(evidence, EXPECTED_SHA);
    }).toThrow(/missing, incomplete, or invalid/u);
  });

  it("accepts proof through the production verifier invocation", () => {
    // Production runs `pnpm --filter @insecur/release-gate verify-preview-smoke-identity`,
    // a thin wrapper around this node command. Pin the wrapper's command and spawn node
    // directly to keep invocation fidelity without pnpm's startup cost under CI load.
    const packageManifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageManifest.scripts["verify-preview-smoke-identity"]).toBe(
      [VERIFIER_COMMAND, ...VERIFIER_ARGS].join(" "),
    );

    const evidencePath = join(
      mkdtempSync(join(tmpdir(), "insecur-preview-smoke-identity-")),
      "deploy-identity.json",
    );
    writeFileSync(evidencePath, JSON.stringify(passingEvidence()), "utf8");

    const result = spawnSync(
      VERIFIER_COMMAND,
      [...VERIFIER_ARGS, "--evidence", evidencePath, "--expected-sha", EXPECTED_SHA],
      { cwd: packageRoot, encoding: "utf8" },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
  }, 60_000);
});
