import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import {
  AUTH_ERROR_CODES,
  auditEventId,
  organizationId,
  userId,
  type KnownErrorCode,
} from "@insecur/domain";
import type { RuntimeRpcResult } from "@insecur/worker-kit";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createRuntimeRpcStub,
  type RuntimeRpcStub,
} from "../../../test/support/runtime-rpc-stub.js";
import { ADMITTED_USER_ID_RAW, WORKOS_USER_ID } from "../../../test/support/setup-unit-auth.js";

import app from "../../index.js";

const admittedUserId = userId.brand(ADMITTED_USER_ID_RAW);
const workosUserId = WORKOS_USER_ID;
const orgId = organizationId.brand("org_00000000000000000000000011");

let runtime: RuntimeRpcStub;

function makeEnv() {
  return {
    WORKOS_API_KEY: "sk_test",
    WORKOS_CLIENT_ID: "client_test",
    WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
    SESSION_SIGNING_SECRET: testSessionSigningSecret(),
    INSTANCE_ID: "inst_LOCAL_DEV",
    RUNTIME_TOKEN_SIGNING_SECRET: "runtime-hop-secret-00000000000000000000000000",
    RUNTIME: runtime,
  };
}

const auditEventsPath = `/v1/orgs/${orgId}/audit-events`;

const metadataOnlyAuditEvent = {
  auditEventId: auditEventId.brand("aud_00000000000000000000000011"),
  organizationId: orgId,
  eventCode: "secret.non_protected_write",
  outcome: "success" as const,
  resultCode: "audit.succeeded",
  actor: {
    actorType: "user" as const,
    userId: userId.brand("usr_00000000000000000000000011"),
  },
  projectId: null,
  environmentId: null,
  resource: null,
  relatedResource: null,
  requestId: null,
  operationId: null,
  details: {
    agentSessionId: "ags_00000000000000000000000011",
    harnessName: "claude-code",
  },
  createdAt: "2026-07-01T00:00:00.000Z",
};

function rpcFailure(
  code: KnownErrorCode,
  message: string,
  retryable = false,
): RuntimeRpcResult<never> {
  return { ok: false, error: { code, message, retryable } };
}

async function authHeaders(env: ReturnType<typeof makeEnv>): Promise<Record<string, string>> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: admittedUserId,
      workosUserId,
      sessionId: "session_audit_events_test",
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
  };
}

describe("audit events worker routes", () => {
  beforeEach(() => {
    runtime = createRuntimeRpcStub();
    runtime.listAuditEvents.mockResolvedValue({
      ok: true,
      value: { events: [metadataOnlyAuditEvent], nextCursor: "cursor_test" },
    });
  });

  it("returns auth.required when unauthenticated", async () => {
    const env = makeEnv();
    const response = await app.request(auditEventsPath, { method: "GET" }, env);

    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code: "auth.required" } });
    expect(runtime.listAuditEvents).not.toHaveBeenCalled();
  });

  it("forwards filters and pagination to the Runtime Worker", async () => {
    const env = makeEnv();
    const query =
      "?actorUserId=usr_00000000000000000000000011" +
      "&projectId=prj_00000000000000000000000011" +
      "&environmentId=env_00000000000000000000000001" +
      "&eventCode=secret.non_protected_write" +
      "&createdAtFrom=2026-07-01T00:00:00.000Z" +
      "&createdAtTo=2026-07-02T00:00:00.000Z" +
      "&pageSize=10" +
      "&cursor=cursor_input";

    const response = await app.request(
      `${auditEventsPath}${query}`,
      { method: "GET", headers: await authHeaders(env) },
      env,
    );

    expect(response.status).toBe(200);
    expect(runtime.listAuditEvents).toHaveBeenCalledTimes(1);
    const forwarded = runtime.listAuditEvents.mock.calls[0]?.[0];
    expect(forwarded?.organizationId).toBe(orgId);
    expect(forwarded?.pageSize).toBe(10);
    expect(forwarded?.cursor).toBe("cursor_input");
    expect(forwarded?.filters?.eventCode).toBe("secret.non_protected_write");
    expect(forwarded?.actorToken.length).toBeGreaterThan(0);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: { events: [metadataOnlyAuditEvent], nextCursor: "cursor_test" },
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/valueUtf8|plaintext|password|secret-value/i);
  });

  it("maps insufficient scope denials from the Runtime Worker", async () => {
    const env = makeEnv();
    runtime.listAuditEvents.mockResolvedValue(
      rpcFailure(AUTH_ERROR_CODES.insufficientScope, "Missing required permission."),
    );

    const response = await app.request(
      auditEventsPath,
      { method: "GET", headers: await authHeaders(env) },
      env,
    );

    expect(response.status).toBe(403);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: AUTH_ERROR_CODES.insufficientScope },
    });
  });
});
