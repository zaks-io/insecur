import { mintEphemeralSessionCredential, testSessionSigningSecret } from "@insecur/auth";
import { AUTH_ERROR_CODES, OPERATION_ERROR_CODES, organizationId, userId } from "@insecur/domain";
import { OperationStoreError } from "@insecur/operations";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMITTED_USER_ID_RAW, WORKOS_USER_ID } from "../../../test/support/setup-unit-auth.js";

const { getOperation, resolveEffectiveAccess, recordAccessDenial } = vi.hoisted(() => ({
  getOperation: vi.fn(),
  resolveEffectiveAccess: vi.fn(),
  recordAccessDenial: vi.fn(),
}));

vi.mock("@insecur/operations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/operations")>();
  return {
    ...actual,
    getOperation,
  };
});

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    resolveEffectiveAccess,
    recordAccessDenial,
  };
});

import app from "../../index.js";

const admittedUserId = userId.brand(ADMITTED_USER_ID_RAW);
const workosUserId = WORKOS_USER_ID;

const orgId = organizationId.brand("org_00000000000000000000000001");
const otherOrgId = organizationId.brand("org_00000000000000000000000002");
const operationIdValue = "op_00000000000000000000000001";

const env = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET: testSessionSigningSecret(),
  INSTANCE_ID: "inst_LOCAL_DEV",
  RUNTIME_TOKEN_SIGNING_SECRET: "runtime-hop-secret-00000000000000000000000000",
  RUNTIME: { writeSecret: vi.fn(), consumeGrant: vi.fn() },
};

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
    auditEventIds: ["aud_00000000000000000000000001"],
  },
  createdAt: "2026-06-24T00:00:00.000Z",
  updatedAt: "2026-06-24T00:01:00.000Z",
};

async function authHeaders(): Promise<Record<string, string>> {
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
    vi.clearAllMocks();
    resolveEffectiveAccess.mockResolvedValue({
      organizationId: orgId,
      scopes: ["organization:read"],
    });
    recordAccessDenial.mockResolvedValue({ auditEventId: "aud_test" });
    getOperation.mockResolvedValue(metadataOnlyOperation);
  });

  describe("GET /v1/orgs/:organizationId/operations/:operationId", () => {
    it("returns auth.required when unauthenticated", async () => {
      const response = await app.request(operationPath, { method: "GET" }, env);

      expect(response.status).toBe(401);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: false, error: { code: "auth.required" } });
      expect(getOperation).not.toHaveBeenCalled();
    });

    it("returns metadata-only operation status from the operations package", async () => {
      const response = await app.request(
        operationPath,
        { method: "GET", headers: await authHeaders() },
        env,
      );

      expect(response.status).toBe(200);
      expect(getOperation).toHaveBeenCalledWith({
        organizationId: orgId,
        operationId: operationIdValue,
      });
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

    it("maps Effective Access denial to auth.insufficient_scope without probing the store", async () => {
      resolveEffectiveAccess.mockResolvedValue({
        organizationId: orgId,
        scopes: [],
      });

      const response = await app.request(
        operationPath,
        { method: "GET", headers: await authHeaders() },
        env,
      );

      expect(response.status).toBe(403);
      expect(getOperation).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: AUTH_ERROR_CODES.insufficientScope },
      });
      expect(recordAccessDenial).toHaveBeenCalled();
    });

    it("maps unknown operation IDs to operation.not_found without existence leakage", async () => {
      getOperation.mockRejectedValue(
        new OperationStoreError(OPERATION_ERROR_CODES.notFound, "operation not found"),
      );

      const response = await app.request(
        operationPath,
        { method: "GET", headers: await authHeaders() },
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

    it("tenant-qualifies cross-tenant reads through the operations package seam", async () => {
      resolveEffectiveAccess.mockResolvedValue({
        organizationId: otherOrgId,
        scopes: ["organization:read"],
      });
      getOperation.mockRejectedValue(
        new OperationStoreError(OPERATION_ERROR_CODES.notFound, "operation not found"),
      );

      const response = await app.request(
        crossTenantPath,
        { method: "GET", headers: await authHeaders() },
        env,
      );

      expect(response.status).toBe(404);
      expect(getOperation).toHaveBeenCalledWith({
        organizationId: otherOrgId,
        operationId: operationIdValue,
      });
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: OPERATION_ERROR_CODES.notFound },
      });
    });

    it("rejects invalid operation id parameters", async () => {
      const response = await app.request(
        `/v1/orgs/${orgId}/operations/not-an-operation-id`,
        { method: "GET", headers: await authHeaders() },
        env,
      );

      expect(response.status).toBe(400);
      expect(getOperation).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: "validation.invalid_opaque_resource_id" },
      });
    });
  });
});
