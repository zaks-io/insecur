import { assertMetadataSafe } from "@insecur/domain";

import { asRecord, readString } from "./evidence-parsers.js";

export const PREVIEW_SMOKE_DEPLOY_IDENTITY_SERVICES = [
  "insecur-api",
  "insecur-web",
  "insecur-site",
] as const;
const GIT_COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/iu;

type PreviewSmokeDeployIdentityService = (typeof PREVIEW_SMOKE_DEPLOY_IDENTITY_SERVICES)[number];

interface PreviewSmokeDeployIdentityObservation {
  deploy_sha: string;
  matches_expected: boolean;
  service: PreviewSmokeDeployIdentityService;
}

interface PreviewSmokeDeployIdentityCheck {
  checked_at: string;
  identities: PreviewSmokeDeployIdentityObservation[];
}

export interface PreviewSmokeDeployIdentityEvidence {
  expected_sha: string;
  post_suite: PreviewSmokeDeployIdentityCheck;
  pre_suite: PreviewSmokeDeployIdentityCheck;
  schema_version: 1;
}

export function assertPreviewSmokeDeployIdentityEvidence(
  value: unknown,
  expectedSha: string,
): void {
  assertMetadataSafe(value);
  const evidence = parsePreviewSmokeDeployIdentityEvidence(value);
  if (!evidence) {
    throw new Error("Preview smoke deploy identity evidence is missing, incomplete, or invalid");
  }
  if (evidence.expected_sha !== expectedSha) {
    throw new Error("Preview smoke deploy identity evidence is for a different commit");
  }

  for (const [phase, check] of [
    ["pre-suite", evidence.pre_suite],
    ["post-suite", evidence.post_suite],
  ] as const) {
    const mismatchedServices = check.identities
      .filter((identity) => !identity.matches_expected || identity.deploy_sha !== expectedSha)
      .map((identity) => identity.service);
    if (mismatchedServices.length > 0) {
      throw new Error(
        `Preview smoke ${phase} deploy identity mismatched for ${mismatchedServices.join(", ")}`,
      );
    }
  }
}

export function parsePreviewSmokeDeployIdentityEvidence(
  value: unknown,
): PreviewSmokeDeployIdentityEvidence | null {
  const record = asRecord(value);
  if (
    !record ||
    !hasOnlyKeys(record, ["schema_version", "expected_sha", "pre_suite", "post_suite"]) ||
    record.schema_version !== 1
  ) {
    return null;
  }

  const expectedSha = readString(record, "expected_sha");
  const preSuite = parsePreviewSmokeDeployIdentityCheck(record.pre_suite);
  const postSuite = parsePreviewSmokeDeployIdentityCheck(record.post_suite);
  if (!isGitCommitSha(expectedSha) || !preSuite || !postSuite) {
    return null;
  }
  return {
    expected_sha: expectedSha,
    post_suite: postSuite,
    pre_suite: preSuite,
    schema_version: 1,
  };
}

function parsePreviewSmokeDeployIdentityCheck(
  value: unknown,
): PreviewSmokeDeployIdentityCheck | null {
  const record = asRecord(value);
  if (!record || !hasOnlyKeys(record, ["checked_at", "identities"])) {
    return null;
  }

  const checkedAt = readString(record, "checked_at");
  if (!isValidTimestamp(checkedAt)) {
    return null;
  }
  const identities = parsePreviewSmokeDeployIdentityObservations(record.identities);
  if (!identities) {
    return null;
  }
  return { checked_at: checkedAt, identities };
}

function isValidTimestamp(value: string | null): value is string {
  return value !== null && !Number.isNaN(Date.parse(value));
}

function parsePreviewSmokeDeployIdentityObservations(
  value: unknown,
): PreviewSmokeDeployIdentityObservation[] | null {
  if (!Array.isArray(value) || value.length !== PREVIEW_SMOKE_DEPLOY_IDENTITY_SERVICES.length) {
    return null;
  }
  const identities = value.map(parsePreviewSmokeDeployIdentityObservation);
  if (identities.some((identity) => identity === null)) {
    return null;
  }

  const parsedIdentities = identities as PreviewSmokeDeployIdentityObservation[];
  const services = new Set(parsedIdentities.map((identity) => identity.service));
  return services.size === PREVIEW_SMOKE_DEPLOY_IDENTITY_SERVICES.length ? parsedIdentities : null;
}

function parsePreviewSmokeDeployIdentityObservation(
  value: unknown,
): PreviewSmokeDeployIdentityObservation | null {
  const record = asRecord(value);
  if (!record || !hasOnlyKeys(record, ["service", "deploy_sha", "matches_expected"])) {
    return null;
  }

  const service = readString(record, "service");
  const deploySha = readString(record, "deploy_sha");
  if (!isPreviewSmokeDeployIdentityService(service) || !isGitCommitSha(deploySha)) {
    return null;
  }
  if (typeof record.matches_expected !== "boolean") {
    return null;
  }
  return {
    deploy_sha: deploySha,
    matches_expected: record.matches_expected,
    service,
  };
}

function isGitCommitSha(value: string | null): value is string {
  return value !== null && GIT_COMMIT_SHA_PATTERN.test(value);
}

function hasOnlyKeys(record: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  return Object.keys(record).every((key) => expectedKeys.includes(key));
}

function isPreviewSmokeDeployIdentityService(
  value: unknown,
): value is PreviewSmokeDeployIdentityService {
  return (
    typeof value === "string" &&
    (PREVIEW_SMOKE_DEPLOY_IDENTITY_SERVICES as readonly string[]).includes(value)
  );
}
