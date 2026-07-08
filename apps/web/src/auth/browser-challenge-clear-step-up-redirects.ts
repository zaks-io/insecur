import type { ClearChallengeOutcome } from "../console/clear-high-assurance-challenge.js";

const DEFAULT_STEP_UP_RETURN_TO = "/orgs";

export function stepUpFailureRedirectPath(
  returnTo: string,
  reason: "factor" | "session" | "unenrolled" | "clear" = "factor",
  code?: string,
): string {
  const url = new URL(returnTo, "https://insecur.invalid");
  url.searchParams.set("approve", "failed");
  url.searchParams.set("approveReason", reason);
  if (code !== undefined) {
    url.searchParams.set("approveCode", code);
  }
  return `${url.pathname}${url.search}`;
}

export function stepUpSuccessRedirectPath(
  returnTo: string,
  outcome: Extract<ClearChallengeOutcome, { ok: true }>,
): string {
  const url = new URL(returnTo, "https://insecur.invalid");
  url.searchParams.set("approved", "1");
  url.searchParams.set("operationId", outcome.operationId);
  if (outcome.challengeId !== undefined) {
    url.searchParams.set("challengeId", outcome.challengeId);
  }
  if (outcome.clearedAt !== undefined) {
    url.searchParams.set("clearedAt", outcome.clearedAt);
  }
  return `${url.pathname}${url.search}`;
}

export function defaultStepUpReturnTo(): string {
  return DEFAULT_STEP_UP_RETURN_TO;
}
