import { expect } from "@playwright/test";

import type { PreviewConfig } from "./env";
import { assertIdentity, getJson } from "./http";

interface IdentityTarget {
  label: string;
  service: string;
  url: string;
}

export interface PreviewDeployIdentityResult {
  deploy_sha: string | null;
  matches_expected: boolean;
  service: string;
}

export interface PreviewDeployIdentityCheck {
  checked_at: string;
  identities: PreviewDeployIdentityResult[];
}

const DEPLOY_IDENTITY_TIMEOUT_MS = 120_000;
const PREVIEW_DEPLOY_IDENTITY_SERVICES = ["insecur-api", "insecur-web", "insecur-site"] as const;
const GIT_COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/iu;

export async function waitForPreviewDeployIdentity(
  preview: PreviewConfig,
): Promise<PreviewDeployIdentityCheck> {
  let readyCheck: PreviewDeployIdentityCheck | undefined;

  await expect
    .poll(
      async () => {
        const check = await checkPreviewDeployIdentity(preview);
        if (previewDeployIdentityMatchesExpected(check)) {
          readyCheck = check;
          return "ready";
        }
        return summarizeIdentityCheck(check);
      },
      {
        intervals: [1_000, 2_000, 5_000],
        timeout: DEPLOY_IDENTITY_TIMEOUT_MS,
      },
    )
    .toBe("ready");

  if (readyCheck === undefined) {
    throw new Error("Preview deployment identity did not become ready");
  }
  return readyCheck;
}

export async function checkPreviewDeployIdentity(
  preview: PreviewConfig,
): Promise<PreviewDeployIdentityCheck> {
  const identities = await Promise.all(
    previewDeployIdentityTargets(preview).map((target) =>
      checkIdentity(target, preview.expectedSha),
    ),
  );
  return { checked_at: new Date().toISOString(), identities };
}

export function assertPreviewDeployIdentityMatchesExpected(
  check: PreviewDeployIdentityCheck,
): void {
  if (!previewDeployIdentityMatchesExpected(check)) {
    throw new Error(`Preview deployment identity mismatch: ${summarizeIdentityCheck(check)}`);
  }
}

function previewDeployIdentityTargets(preview: PreviewConfig): IdentityTarget[] {
  return [
    {
      label: "API healthz",
      service: "insecur-api",
      url: `${preview.apiBaseUrl}/healthz`,
    },
    {
      label: "Web healthz",
      service: "insecur-web",
      url: `${preview.webBaseUrl}/healthz`,
    },
    {
      label: "Site healthz",
      service: "insecur-site",
      url: `${preview.siteBaseUrl}/healthz`,
    },
  ];
}

function previewDeployIdentityMatchesExpected(check: PreviewDeployIdentityCheck): boolean {
  return (
    check.identities.length === PREVIEW_DEPLOY_IDENTITY_SERVICES.length &&
    check.identities.every((identity) => identity.matches_expected)
  );
}

function summarizeIdentityCheck(check: PreviewDeployIdentityCheck): string {
  const mismatched = check.identities
    .filter((identity) => !identity.matches_expected)
    .map((identity) => identity.service);
  return mismatched.length === 0 ? "ready" : `mismatched services: ${mismatched.join(", ")}`;
}

async function checkIdentity(
  target: IdentityTarget,
  expectedSha: string,
): Promise<PreviewDeployIdentityResult> {
  let deploySha: string | null = null;
  try {
    const body = await getJson(cacheBustedUrl(target.url), target.label);
    deploySha = parseCommitSha(body.deploySha);
    assertIdentity(body, target.service, expectedSha);
    return { deploy_sha: deploySha, matches_expected: true, service: target.service };
  } catch {
    return {
      deploy_sha: deploySha,
      matches_expected: false,
      service: target.service,
    };
  }
}

function parseCommitSha(value: unknown): string | null {
  return typeof value === "string" && GIT_COMMIT_SHA_PATTERN.test(value) ? value : null;
}

function cacheBustedUrl(url: string): string {
  const output = new URL(url);
  output.searchParams.set(
    "deploy_identity_probe",
    `${String(Date.now())}-${String(Math.random())}`,
  );
  return output.toString();
}
