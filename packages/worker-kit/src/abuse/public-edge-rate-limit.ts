import type { UserId } from "@insecur/domain";
import { AbuseLimitError } from "./abuse-limit-error.js";
import type { PublicEdgeAbuseTarget } from "./public-edge-abuse-target.js";
import type { PublicEdgeRateLimitBindings } from "./public-edge-rate-limit-bindings.js";
import type { RateLimiterBinding } from "./rate-limiter-binding.js";

async function allowLimiter(
  binding: RateLimiterBinding | undefined,
  key: string,
): Promise<boolean> {
  if (binding === undefined) {
    return true;
  }
  const { success } = await binding.limit({ key });
  return success;
}

function onboardingChecks(
  bindings: PublicEdgeRateLimitBindings,
  ipAddress?: string,
  actorUserId?: UserId,
): Promise<boolean>[] {
  const checks: Promise<boolean>[] = [];
  if (ipAddress !== undefined) {
    checks.push(allowLimiter(bindings.ONBOARDING_IP, `ip:${ipAddress}`));
  }
  if (actorUserId !== undefined) {
    checks.push(allowLimiter(bindings.ONBOARDING_ACTOR, `actor:${actorUserId}`));
  }
  return checks;
}

function bootstrapChecks(
  bindings: PublicEdgeRateLimitBindings,
  ipAddress?: string,
  actorUserId?: UserId,
): Promise<boolean>[] {
  const checks: Promise<boolean>[] = [];
  if (ipAddress !== undefined) {
    checks.push(allowLimiter(bindings.BOOTSTRAP_IP, `ip:${ipAddress}`));
  }
  if (actorUserId !== undefined) {
    checks.push(allowLimiter(bindings.BOOTSTRAP_ACTOR, `actor:${actorUserId}`));
  }
  return checks;
}

function authExchangeChecks(
  bindings: PublicEdgeRateLimitBindings,
  ipAddress?: string,
): Promise<boolean>[] {
  if (ipAddress === undefined) {
    return [];
  }
  return [allowLimiter(bindings.AUTH_EXCHANGE_IP, `ip:${ipAddress}`)];
}

function checksForTarget(
  bindings: PublicEdgeRateLimitBindings,
  target: PublicEdgeAbuseTarget,
  ipAddress?: string,
  actorUserId?: UserId,
): Promise<boolean>[] {
  switch (target) {
    case "onboarding_guided_provision":
      return onboardingChecks(bindings, ipAddress, actorUserId);
    case "bootstrap_operator_claim":
      return bootstrapChecks(bindings, ipAddress, actorUserId);
    case "auth_cli_pkce_exchange":
      return authExchangeChecks(bindings, ipAddress);
  }
}

export interface EnforcePublicEdgeRateLimitInput {
  readonly bindings: PublicEdgeRateLimitBindings;
  readonly target: PublicEdgeAbuseTarget;
  readonly ipAddress?: string;
  readonly actorUserId?: UserId;
}

/**
 * Enforces per-IP and per-actor Cloudflare Rate Limiting bindings for the three
 * pre-tenant public edges. Missing bindings pass through for local dev/tests.
 */
export async function enforcePublicEdgeRateLimit(
  input: EnforcePublicEdgeRateLimitInput,
): Promise<void> {
  const results = await Promise.all(
    checksForTarget(input.bindings, input.target, input.ipAddress, input.actorUserId),
  );
  if (results.some((allowed) => !allowed)) {
    throw new AbuseLimitError(input.target);
  }
}
