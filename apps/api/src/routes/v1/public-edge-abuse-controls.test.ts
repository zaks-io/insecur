import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import {
  ABUSE_ERROR_CODES,
  environmentId,
  membershipId,
  organizationId,
  projectId,
  teamId,
  userId,
} from "@insecur/domain";
import { createInMemoryRateLimiter } from "@insecur/worker-kit";
import { beforeEach, describe, expect, it } from "vitest";
import { createRuntimeRpcStub } from "../../../test/support/runtime-rpc-stub.js";
import { ADMITTED_USER_ID_RAW, WORKOS_USER_ID } from "../../../test/support/setup-unit-auth.js";
import app from "../../index.js";

const admittedUserId = userId.brand(ADMITTED_USER_ID_RAW);
const orgId = organizationId.brand("org_00000000000000000000000001");
const ownerMembershipIdValue = membershipId.brand("mem_00000000000000000000000001");

let runtime = createRuntimeRpcStub();

function baseEnv(overrides: Record<string, unknown> = {}) {
  return {
    WORKOS_API_KEY: "sk_test",
    WORKOS_CLIENT_ID: "client_test",
    WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
    SESSION_SIGNING_SECRET: testSessionSigningSecret(),
    RUNTIME_TOKEN_SIGNING_SECRET: "runtime-hop-secret-00000000000000000000000000",
    INSTANCE_ID: "inst_ABUSE_TEST",
    RUNTIME: runtime,
    ...overrides,
  };
}

async function authHeaders(env: ReturnType<typeof baseEnv>) {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: admittedUserId,
      workosUserId: WORKOS_USER_ID,
      sessionId: "session_abuse_test",
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
    "Content-Type": "application/json",
    "cf-connecting-ip": "203.0.113.50",
  };
}

describe("public-edge abuse controls", () => {
  beforeEach(() => {
    runtime = createRuntimeRpcStub();
  });

  it("returns abuse.rate_limited for throttled onboarding requests and audits the denial", async () => {
    runtime.provisionGuidedOrganization.mockResolvedValue({
      ok: true,
      value: {
        organizationId: orgId,
        defaultTeamId: teamId.brand("team_00000000000000000000000001"),
        ownerMembershipId: ownerMembershipIdValue,
        projectId: projectId.brand("prj_00000000000000000000000001"),
        developmentEnvironmentId: environmentId.brand("env_00000000000000000000000001"),
      },
    });

    const env = baseEnv({
      ONBOARDING_IP: createInMemoryRateLimiter(1),
      ONBOARDING_ACTOR: createInMemoryRateLimiter(10),
    });

    const first = await app.request(
      "/v1/onboarding/personal-organization",
      { method: "POST", headers: await authHeaders(env), body: "{}" },
      env,
    );
    expect(first.status).toBe(200);

    const second = await app.request(
      "/v1/onboarding/personal-organization",
      { method: "POST", headers: await authHeaders(env), body: "{}" },
      env,
    );
    expect(second.status).toBe(429);
    const body: unknown = await second.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: ABUSE_ERROR_CODES.rateLimited, retryable: true },
    });
    expect(runtime.recordAbuseDenied).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: "onboarding.guided_organization_provision_denied",
        reasonCode: ABUSE_ERROR_CODES.rateLimited,
        actorUserId: admittedUserId,
      }),
    );
    expect(runtime.provisionGuidedOrganization).toHaveBeenCalledTimes(1);
  });

  it("returns abuse.rate_limited for throttled bootstrap operator-claim attempts", async () => {
    const env = baseEnv({
      BOOTSTRAP_IP: createInMemoryRateLimiter(1),
      BOOTSTRAP_ACTOR: createInMemoryRateLimiter(5),
    });
    runtime.completeBootstrapOperatorClaim.mockResolvedValue({
      ok: true,
      value: {
        instanceId: env.INSTANCE_ID,
        organizationId: orgId,
        operatorGrantId: "iop_00000000000000000000000001",
        ownerMembershipId: ownerMembershipIdValue,
        status: {
          phase: "complete",
          instanceId: env.INSTANCE_ID,
          organizationId: orgId,
          operatorUserId: admittedUserId,
        },
      },
    });

    const claimBody = JSON.stringify({
      bootstrapSecret: "bootstrap-secret-material",
      operatorGrantId: "iop_00000000000000000000000001",
      ownerMembershipId: ownerMembershipIdValue,
    });

    const first = await app.request(
      "/v1/instance/bootstrap/operator-claim",
      { method: "POST", headers: await authHeaders(env), body: claimBody },
      env,
    );
    expect(first.status).toBe(200);

    const second = await app.request(
      "/v1/instance/bootstrap/operator-claim",
      { method: "POST", headers: await authHeaders(env), body: claimBody },
      env,
    );
    expect(second.status).toBe(429);
    expect(runtime.recordAbuseDenied).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: "bootstrap.operator_claim_denied",
        reasonCode: ABUSE_ERROR_CODES.rateLimited,
      }),
    );
    expect(runtime.completeBootstrapOperatorClaim).toHaveBeenCalledTimes(1);
  });

  it("returns abuse.rate_limited for throttled CLI PKCE exchange attempts", async () => {
    const env = baseEnv({
      AUTH_EXCHANGE_IP: createInMemoryRateLimiter(1),
    });

    const exchangeBody = JSON.stringify({ code: "code_1", codeVerifier: "verifier_1" });
    const headers = { "Content-Type": "application/json", "cf-connecting-ip": "203.0.113.99" };

    const first = await app.request(
      "/v1/auth/cli/pkce/exchange",
      { method: "POST", headers, body: exchangeBody },
      env,
    );
    expect(first.status).not.toBe(429);

    const second = await app.request(
      "/v1/auth/cli/pkce/exchange",
      { method: "POST", headers, body: exchangeBody },
      env,
    );
    expect(second.status).toBe(429);
    const body: unknown = await second.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: ABUSE_ERROR_CODES.rateLimited },
    });
    expect(runtime.recordAbuseDenied).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: "auth.cli_pkce_exchange_denied",
        reasonCode: ABUSE_ERROR_CODES.rateLimited,
      }),
    );
  });
});
