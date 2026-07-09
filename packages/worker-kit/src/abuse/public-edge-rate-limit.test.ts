import { ABUSE_ERROR_CODES, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { AbuseLimitError } from "./abuse-limit-error.js";
import { enforcePublicEdgeRateLimit } from "./public-edge-rate-limit.js";
import { createInMemoryRateLimiter } from "./rate-limiter-binding.js";

const actorUserId = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");

describe("enforcePublicEdgeRateLimit", () => {
  it("passes when bindings are absent", async () => {
    await expect(
      enforcePublicEdgeRateLimit({
        bindings: {},
        target: "auth_cli_pkce_exchange",
        ipAddress: "203.0.113.1",
      }),
    ).resolves.toBeUndefined();
  });

  it("throws abuse.rate_limited when the onboarding IP limiter rejects", async () => {
    const bindings = { ONBOARDING_IP: createInMemoryRateLimiter(1) };

    await expect(
      enforcePublicEdgeRateLimit({
        bindings,
        target: "onboarding_guided_provision",
        ipAddress: "203.0.113.1",
        actorUserId,
      }),
    ).resolves.toBeUndefined();

    await expect(
      enforcePublicEdgeRateLimit({
        bindings,
        target: "onboarding_guided_provision",
        ipAddress: "203.0.113.1",
        actorUserId,
      }),
    ).rejects.toBeInstanceOf(AbuseLimitError);
  });

  it("throttles the device-token target on its own bucket, not the PKCE exchange bucket", async () => {
    const bindings = {
      AUTH_DEVICE_TOKEN_IP: createInMemoryRateLimiter(1),
      AUTH_EXCHANGE_IP: createInMemoryRateLimiter(5),
    };

    await enforcePublicEdgeRateLimit({
      bindings,
      target: "auth_cli_device_token",
      ipAddress: "203.0.113.9",
    });

    // Second device poll from the same IP trips the dedicated device bucket.
    await expect(
      enforcePublicEdgeRateLimit({
        bindings,
        target: "auth_cli_device_token",
        ipAddress: "203.0.113.9",
      }),
    ).rejects.toBeInstanceOf(AbuseLimitError);

    // The PKCE exchange bucket is untouched by device polling.
    await expect(
      enforcePublicEdgeRateLimit({
        bindings,
        target: "auth_cli_pkce_exchange",
        ipAddress: "203.0.113.9",
      }),
    ).resolves.toBeUndefined();
  });

  it("throws abuse.rate_limited when the onboarding actor limiter rejects", async () => {
    const bindings = { ONBOARDING_ACTOR: createInMemoryRateLimiter(1) };

    await enforcePublicEdgeRateLimit({
      bindings,
      target: "onboarding_guided_provision",
      actorUserId,
    });

    await expect(
      enforcePublicEdgeRateLimit({
        bindings,
        target: "onboarding_guided_provision",
        actorUserId,
      }),
    ).rejects.toMatchObject({ code: ABUSE_ERROR_CODES.rateLimited });
  });
});
