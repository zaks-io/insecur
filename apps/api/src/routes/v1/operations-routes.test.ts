import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import {
  AUTH_ERROR_CODES,
  OPERATION_ERROR_CODES,
  auditEventId,
  operationId,
  organizationId,
  userId,
} from "@insecur/domain";
import type { KnownErrorCode } from "@insecur/domain";
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

const orgId = organizationId.brand("org_00000000000000000000000001");
const otherOrgId = organizationId.brand("org_00000000000000000000000002");
const operationIdValue = operationId.brand("op_00000000000000000000000001");

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

const operationPath = `/v1/orgs/${orgId}/operations/${operationIdValue}`;
const crossTenantPath = `/v1/orgs/${otherOrgId}/operations/${operationIdValue}`;

const metadataOnlyOperation = {
  operationId: operationIdValue,
  organizationId: orgId,
  state: "running" as const,
  intentCode: "sync.run",
  progress: {
    counters: { bindingsTotal: 3, bindingsSucceeded: 1 },
    providerStatusCode: "sync.target_busy",
    wait: { reasonCode: "auth.high_assurance_required" },
    auditEventIds: [auditEventId.brand("aud_00000000000000000000000001")],
  },
  createdAt: "2026-06-24T00:00:00.000Z",
  updatedAt: "2026-06-24T00:01:00.000Z",
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
      sessionId: "session_operations_test",
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
  };
}

describe("operations worker routes", () => {
  beforeEach(() => {
    runtime = createRuntimeRpcStub();
    runtime.getOperation.mockResolvedValue({ ok: true, value: metadataOnlyOperation });
  });

  describe("GET /v1/orgs/:organizationId/operations/:operationId", () => {
    it("returns auth.required when unauthenticated", async () => {
      const env = makeEnv();
      const response = await app.request(operationPath, { method: "GET" }, env);

      expect(response.status).toBe(401);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: false, error: { code: "auth.required" } });
      expect(runtime.getOperation).not.toHaveBeenCalled();
    });

    it("forwards the read to the Runtime Worker and returns metadata-only status", async () => {
      const env = makeEnv();
      const response = await app.request(
        operationPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(200);
      expect(runtime.getOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          operationId: operationIdValue,
        }),
      );
      const forwarded = runtime.getOperation.mock.calls[0]?.[0];
      expect(forwarded?.actorToken.length).toBeGreaterThan(0);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: {
          operationId: operationIdValue,
          organizationId: orgId,
          state: "running",
          intentCode: "sync.run",
          progress: {
            counters: { bindingsTotal: 3, bindingsSucceeded: 1 },
            providerStatusCode: "sync.target_busy",
          },
        },
      });
      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/valueUtf8|plaintext|secret|password/i);
    });

    it("maps an invalid hop-token signing secret to auth.config_invalid", async () => {
      const env = {
        ...makeEnv(),
        RUNTIME_TOKEN_SIGNING_SECRET: "short-runtime-hop-secret",
      };
      const response = await app.request(
        operationPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(503);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: {
          code: "auth.config_invalid",
          retryable: false,
        },
      });
      expect(runtime.getOperation).not.toHaveBeenCalled();
    });

    it("maps a Runtime insufficient-scope denial to auth.insufficient_scope", async () => {
      const env = makeEnv();
      runtime.getOperation.mockResolvedValue(
        rpcFailure(AUTH_ERROR_CODES.insufficientScope, "actor lacks organization:read"),
      );

      const response = await app.request(
        operationPath,
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

    it("maps unknown operation IDs to operation.not_found without existence leakage", async () => {
      const env = makeEnv();
      runtime.getOperation.mockResolvedValue(
        rpcFailure(OPERATION_ERROR_CODES.notFound, "operation not found"),
      );

      const response = await app.request(
        operationPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(404);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: OPERATION_ERROR_CODES.notFound },
      });
      expect(JSON.stringify(body)).not.toContain("operation not found");
    });

    it("tenant-qualifies cross-tenant reads through the Runtime seam", async () => {
      const env = makeEnv();
      runtime.getOperation.mockResolvedValue(
        rpcFailure(OPERATION_ERROR_CODES.notFound, "operation not found"),
      );

      const response = await app.request(
        crossTenantPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(404);
      expect(runtime.getOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: otherOrgId,
          operationId: operationIdValue,
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: OPERATION_ERROR_CODES.notFound },
      });
    });

    it("rejects invalid operation id parameters", async () => {
      const env = makeEnv();
      const response = await app.request(
        `/v1/orgs/${orgId}/operations/not-an-operation-id`,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(400);
      expect(runtime.getOperation).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: "validation.invalid_opaque_resource_id" },
      });
    });
  });
});
