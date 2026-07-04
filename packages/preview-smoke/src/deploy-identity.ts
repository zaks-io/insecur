import { expect } from "@playwright/test";

import type { PreviewConfig } from "./env";
import { assertIdentity, getJson } from "./http";

interface IdentityTarget {
  label: string;
  service: string;
  url: string;
}

interface IdentityResult {
  ok: boolean;
  message: string;
}

const DEPLOY_IDENTITY_TIMEOUT_MS = 120_000;

export async function waitForPreviewDeployIdentity(preview: PreviewConfig): Promise<void> {
  const targets: IdentityTarget[] = [
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

  await expect
    .poll(async () => summarizeIdentity(targets, preview.expectedSha), {
      intervals: [1_000, 2_000, 5_000],
      timeout: DEPLOY_IDENTITY_TIMEOUT_MS,
    })
    .toBe("ready");
}

async function summarizeIdentity(targets: IdentityTarget[], expectedSha: string): Promise<string> {
  const results = await Promise.all(targets.map((target) => checkIdentity(target, expectedSha)));
  const pending = results.filter((result) => !result.ok).map((result) => result.message);
  return pending.length === 0 ? "ready" : pending.join("; ");
}

async function checkIdentity(target: IdentityTarget, expectedSha: string): Promise<IdentityResult> {
  try {
    const body = await getJson(cacheBustedUrl(target.url), target.label);
    assertIdentity(body, target.service, expectedSha);
    return { message: "", ok: true };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      ok: false,
    };
  }
}

function cacheBustedUrl(url: string): string {
  const output = new URL(url);
  output.searchParams.set(
    "deploy_identity_probe",
    `${String(Date.now())}-${String(Math.random())}`,
  );
  return output.toString();
}
