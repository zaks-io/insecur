import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { PREVIEW_SMOKE_ARTIFACT_ROOT } from "./artifact-root.js";
import {
  assertPreviewDeployIdentityMatchesExpected,
  type PreviewDeployIdentityCheck,
} from "./deploy-identity.js";

const PREVIEW_SMOKE_DEPLOY_IDENTITY_PROOF_PATH = join(
  PREVIEW_SMOKE_ARTIFACT_ROOT,
  "deploy-identity.json",
);

interface PartialPreviewSmokeDeployIdentityProof {
  expected_sha?: unknown;
  pre_suite?: unknown;
  schema_version?: unknown;
}

interface PreviewSmokeDeployIdentityProof {
  expected_sha: string;
  post_suite: PreviewDeployIdentityCheck;
  pre_suite: PreviewDeployIdentityCheck;
  schema_version: 1;
}

export function resetPreviewDeployIdentityProof(
  path = PREVIEW_SMOKE_DEPLOY_IDENTITY_PROOF_PATH,
): void {
  rmSync(path, { force: true });
}

export function writePreSuiteDeployIdentityProof(
  expectedSha: string,
  preSuite: PreviewDeployIdentityCheck,
  path = PREVIEW_SMOKE_DEPLOY_IDENTITY_PROOF_PATH,
): void {
  writeProof(path, {
    expected_sha: expectedSha,
    pre_suite: preSuite,
    schema_version: 1,
  });
}

export function writePostSuiteDeployIdentityProof(
  expectedSha: string,
  postSuite: PreviewDeployIdentityCheck,
  path = PREVIEW_SMOKE_DEPLOY_IDENTITY_PROOF_PATH,
): void {
  const preSuite = readPreSuiteDeployIdentityProof(path, expectedSha);
  const proof: PreviewSmokeDeployIdentityProof = {
    expected_sha: expectedSha,
    post_suite: postSuite,
    pre_suite: preSuite,
    schema_version: 1,
  };
  writeProof(path, proof);
  assertPreviewDeployIdentityMatchesExpected(postSuite);
}

function readPreSuiteDeployIdentityProof(
  path: string,
  expectedSha: string,
): PreviewDeployIdentityCheck {
  if (!existsSync(path)) {
    throw new Error("Preview smoke pre-suite deployment identity proof is missing");
  }

  return parsePreSuiteDeployIdentityProof(readProof(path), expectedSha);
}

function readProof(path: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    throw new Error("Preview smoke pre-suite deployment identity proof is invalid");
  }
  return parsed;
}

function parsePreSuiteDeployIdentityProof(
  parsed: unknown,
  expectedSha: string,
): PreviewDeployIdentityCheck {
  if (!isRecord(parsed)) {
    throw new Error("Preview smoke pre-suite deployment identity proof is invalid");
  }

  const proof = parsed as PartialPreviewSmokeDeployIdentityProof;
  if (proof.schema_version !== 1) {
    throw new Error("Preview smoke pre-suite deployment identity proof is invalid");
  }
  if (proof.expected_sha !== expectedSha) {
    throw new Error("Preview smoke pre-suite deployment identity proof is invalid");
  }
  if (!isPreviewDeployIdentityCheck(proof.pre_suite)) {
    throw new Error("Preview smoke pre-suite deployment identity proof is invalid");
  }
  return proof.pre_suite;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPreviewDeployIdentityCheck(value: unknown): value is PreviewDeployIdentityCheck {
  return isRecord(value);
}

function writeProof(
  path: string,
  proof: PartialPreviewSmokeDeployIdentityProof | PreviewSmokeDeployIdentityProof,
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
}
