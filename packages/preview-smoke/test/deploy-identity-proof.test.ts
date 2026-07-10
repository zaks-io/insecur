import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  type PreviewDeployIdentityCheck,
  type PreviewDeployIdentityResult,
} from "../src/deploy-identity.js";
import {
  writePostSuiteDeployIdentityProof,
  writePreSuiteDeployIdentityProof,
} from "../src/deploy-identity-proof.js";

const EXPECTED_SHA = "a".repeat(40);

function identityCheck(deploySha = EXPECTED_SHA): PreviewDeployIdentityCheck {
  const identities: PreviewDeployIdentityResult[] = [
    "insecur-api",
    "insecur-web",
    "insecur-site",
  ].map((service) => ({
    deploy_sha: deploySha,
    matches_expected: deploySha === EXPECTED_SHA,
    service,
  }));
  return { checked_at: "2026-07-09T00:00:00.000Z", identities };
}

describe("preview deploy identity proof", () => {
  it("fails and records the post-suite mismatch when identity changes during smoke", () => {
    const proofPath = join(mkdtempSync(join(tmpdir(), "insecur-preview-identity-")), "proof.json");
    writePreSuiteDeployIdentityProof(EXPECTED_SHA, identityCheck(), proofPath);
    const postSuite = identityCheck();
    postSuite.identities = postSuite.identities.map((identity, index) =>
      index === 2 ? { ...identity, deploy_sha: "b".repeat(40), matches_expected: false } : identity,
    );

    expect(() => {
      writePostSuiteDeployIdentityProof(EXPECTED_SHA, postSuite, proofPath);
    }).toThrow(/Preview deployment identity mismatch/u);

    const proof = JSON.parse(readFileSync(proofPath, "utf8")) as {
      post_suite: PreviewDeployIdentityCheck;
    };
    expect(proof.post_suite.identities[2]?.matches_expected).toBe(false);
  });
});
