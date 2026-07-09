import type { RateLimiterBinding } from "./rate-limiter-binding.js";

/**
 * Cloudflare Rate Limiting bindings for pre-tenant public edges (INS-278).
 * Configured in `apps/api/wrangler.jsonc`; absent in local vitest env (pass-through).
 */
export interface PublicEdgeRateLimitBindings {
  readonly ONBOARDING_IP?: RateLimiterBinding;
  readonly ONBOARDING_ACTOR?: RateLimiterBinding;
  readonly BOOTSTRAP_IP?: RateLimiterBinding;
  readonly BOOTSTRAP_ACTOR?: RateLimiterBinding;
  readonly AUTH_EXCHANGE_IP?: RateLimiterBinding;
  readonly AUTH_DEVICE_TOKEN_IP?: RateLimiterBinding;
}
