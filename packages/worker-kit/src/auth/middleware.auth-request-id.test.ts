import { organizationId } from "@insecur/domain";
import { testSessionSigningSecret } from "@insecur/auth";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthWorkerEnv } from "./auth-worker-env.js";
import { requireUserActor } from "./middleware.js";

vi.mock("@insecur/audit", () => ({
  recordAccessDeniedAudit: vi.fn(),
}));

vi.mock("@insecur/onboarding", () => ({
  loadInstanceAnchorOrganizationId: vi.fn(),
}));

vi.mock("@insecur/tenant-store", () => ({
  resolveAdmittedUserId: vi.fn(),
  resolveActiveUserAdmission: vi.fn(),
  withTenantScope: vi.fn(),
}));

import { recordAccessDeniedAudit } from "@insecur/audit";
import { loadInstanceAnchorOrganizationId } from "@insecur/onboarding";
import {
  resolveAdmittedUserId,
  resolveActiveUserAdmission,
  withTenantScope,
} from "@insecur/tenant-store";

const mockedResolveAdmittedUserId = vi.mocked(resolveAdmittedUserId);
const mockedResolveActive = vi.mocked(resolveActiveUserAdmission);
const mockedWithTenantScope = vi.mocked(withTenantScope);
const mockedRecordDenied = vi.mocked(recordAccessDeniedAudit);
const mockedLoadAnchorOrg = vi.mocked(loadInstanceAnchorOrganizationId);

const instanceId = "inst_01JZ8E2QYQ6M7F4K9A2B3C4D5E";
const workosUserId = "user_not_admitted";
const anchorOrg = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const sealedSession = "sealed_not_admitted";

const env: AuthWorkerEnv = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET: testSessionSigningSecret(),
  INSTANCE_ID: instanceId,
  WORKOS_FAKE_SESSIONS_JSON: JSON.stringify([
    {
      sessionData: sealedSession,
      userId: workosUserId,
      sessionId: "session_x",
      authenticationMethod: "Passkey",
    },
  ]),
};

function createAuthFailureApp(): Hono<{ Bindings: AuthWorkerEnv }> {
  const app = new Hono<{ Bindings: AuthWorkerEnv }>();
  app.onError((err, context) => {
    if ("requestId" in err && typeof err.requestId === "string") {
      return context.json(
        {
          ok: false,
          error: { code: "auth.required", message: err.message, retryable: false },
          meta: { requestId: err.requestId },
        },
        401,
      );
    }
    throw err;
  });
  app.get("/protected", requireUserActor, (context) => context.json({ ok: true }));
  return app;
}

describe("requireUserActor admission-denied request id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedResolveAdmittedUserId.mockResolvedValue(null);
    mockedResolveActive.mockResolvedValue(null);
    mockedWithTenantScope.mockImplementation(async (_scope, run) => {
      const sql = vi.fn().mockResolvedValue([]);
      return await run({ sql } as never);
    });
    mockedLoadAnchorOrg.mockResolvedValue(anchorOrg);
  });

  it("reuses one request id for denied-admission audit and the auth failure response", async () => {
    const app = createAuthFailureApp();
    const response = await app.request(
      "/protected",
      { method: "GET", headers: { Cookie: `wos-session=${sealedSession}` } },
      env,
    );

    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: "auth.required", retryable: false },
    });

    const responseRequestId = (body as { meta?: { requestId?: string } }).meta?.requestId;
    expect(responseRequestId).toMatch(/^req_/);
    expect(mockedRecordDenied).toHaveBeenCalledTimes(1);
    expect(mockedRecordDenied.mock.calls[0]?.[0]?.request?.requestId).toBe(responseRequestId);
  });

  it("preserves auth failure response when denied-admission audit persistence fails", async () => {
    mockedLoadAnchorOrg.mockRejectedValueOnce(new Error("anchor org unavailable"));

    const app = createAuthFailureApp();
    const response = await app.request(
      "/protected",
      { method: "GET", headers: { Cookie: `wos-session=${sealedSession}` } },
      env,
    );

    expect(response.status).toBe(401);
    expect(mockedRecordDenied).not.toHaveBeenCalled();
    const body: unknown = await response.json();
    expect((body as { meta?: { requestId?: string } }).meta?.requestId).toMatch(/^req_/);
  });
});
