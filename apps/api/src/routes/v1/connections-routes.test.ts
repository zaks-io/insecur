import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import {
  AUTH_ERROR_CODES,
  appConnectionId,
  operationId,
  organizationId,
  parseDisplayName,
  userId,
  type DisplayName,
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

const orgId = organizationId.brand("org_00000000000000000000000001");
const connectionIdValue = appConnectionId.brand("conn_00000000000000000000000001");
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

function testDisplayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`invalid fixture display name: ${raw}`);
  }
  return parsed.value;
}

const listPath = `/v1/orgs/${orgId}/connections`;
const createPath = `/v1/orgs/${orgId}/connections`;
const statusPath = `/v1/orgs/${orgId}/connections/${connectionIdValue}`;
const reauthPath = `/v1/orgs/${orgId}/connections/${connectionIdValue}/reauth`;
const rotatePath = `/v1/orgs/${orgId}/connections/${connectionIdValue}/rotate`;
const disconnectPath = `/v1/orgs/${orgId}/connections/${connectionIdValue}/disconnect`;

const metadataOnlyConnection = {
  id: connectionIdValue,
  organizationId: orgId,
  provider: "cloudflare",
  connectionMethod: "scoped-api-token",
  displayName: testDisplayName("Cloudflare workers"),
  status: "active",
  statusReasonCode: null,
  hasActiveCredential: true,
  setupUserId: admittedUserId,
  lastValidationCheckedAt: "2026-07-01T00:00:00.000Z",
  lastValidationOutcome: "success" as const,
  lastValidationReasonCode: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const cloudflareValidation = {
  checkedAt: "2026-07-01T00:00:00.000Z",
  outcome: "success" as const,
  reasonCode: null,
  tokenStatus: "active" as const,
  workerScriptReachable: true,
  hasBoundaryWarning: false,
};

const githubValidation = {
  checkedAt: "2026-07-01T00:00:00.000Z",
  outcome: "success" as const,
  reasonCode: null,
  installationStatus: "active" as const,
  accessibleRepositoryCount: 2,
  repositoriesWithinBoundary: true,
};

async function authHeaders(env: ReturnType<typeof makeEnv>): Promise<Record<string, string>> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: admittedUserId,
      workosUserId,
      sessionId: "session_connections_test",
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
  };
}

describe("connections worker routes", () => {
  beforeEach(() => {
    runtime = createRuntimeRpcStub();
  });

  async function authedRequest(path: string, init: RequestInit = {}): Promise<Response> {
    const env = makeEnv();
    const headers = new Headers(await authHeaders(env));
    headers.set("Accept", "application/json");
    if (init.headers !== undefined) {
      const extra = new Headers(init.headers);
      extra.forEach((value, key) => {
        headers.set(key, value);
      });
    }
    return app.request(path, { ...init, headers }, env);
  }

  describe("GET /v1/orgs/:organizationId/connections", () => {
    it("forwards list to the Runtime deploy", async () => {
      runtime.listAppConnections.mockResolvedValue({
        ok: true,
        value: { connections: [metadataOnlyConnection] },
      } satisfies RuntimeRpcResult<unknown>);

      const response = await authedRequest(listPath, { method: "GET" });
      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: { connections: [{ id: connectionIdValue, provider: "cloudflare" }] },
      });
      expect(runtime.listAppConnections).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: orgId }),
      );
      expect(JSON.stringify(body)).not.toMatch(/tokenUtf8|encodedValueUtf8|providerCredential/i);
    });
  });

  describe("POST /v1/orgs/:organizationId/connections", () => {
    it("forwards create with Cloudflare boundary to the Runtime deploy", async () => {
      runtime.createAppConnection.mockResolvedValue({
        ok: true,
        value: {
          connection: metadataOnlyConnection,
          validation: cloudflareValidation,
          auditEventId: "aud_00000000000000000000000001",
        },
      } satisfies RuntimeRpcResult<unknown>);

      const response = await authedRequest(createPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appConnectionId: connectionIdValue,
          provider: "cloudflare",
          connectionMethod: "scoped-api-token",
          displayName: "Cloudflare workers",
          tokenUtf8: "scoped-token-value",
          allowAccountId: "cf-account-123",
          allowWorkerScript: "my-api-production",
        }),
      });

      expect(response.status).toBe(200);
      expect(runtime.createAppConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          appConnectionId: connectionIdValue,
          cloudflareBoundary: {
            allowedAccountId: "cf-account-123",
            allowedWorkerScript: "my-api-production",
          },
        }),
      );
    });

    it("returns auth.high_assurance_required with operationId when challenge is missing", async () => {
      runtime.createAppConnection.mockResolvedValue({
        ok: false,
        error: {
          code: AUTH_ERROR_CODES.highAssuranceRequired,
          message: "high-assurance challenge required",
          retryable: false,
          operationId: operationIdValue,
        },
      });

      const response = await authedRequest(createPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appConnectionId: connectionIdValue,
          provider: "cloudflare",
          connectionMethod: "scoped-api-token",
          displayName: "Cloudflare workers",
          tokenUtf8: "scoped-token-value",
          allowAccountId: "cf-account-123",
          allowWorkerScript: "my-api-production",
        }),
      });

      expect(response.status).toBe(401);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: AUTH_ERROR_CODES.highAssuranceRequired },
        meta: { operationId: operationIdValue },
      });
    });
  });

  describe("GET /v1/orgs/:organizationId/connections/:connectionId", () => {
    it("returns metadata-only status payload", async () => {
      runtime.getAppConnectionStatus.mockResolvedValue({
        ok: true,
        value: {
          connection: metadataOnlyConnection,
          validation: cloudflareValidation,
          cloudflareBoundary: {
            allowedAccountId: "cf-account-123",
            allowedWorkerScript: "my-api-production",
          },
          githubBoundary: null,
        },
      });

      const response = await authedRequest(statusPath, { method: "GET" });
      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: {
          connection: { id: connectionIdValue },
          cloudflareBoundary: { allowedWorkerScript: "my-api-production" },
        },
      });
      expect(JSON.stringify(body)).not.toMatch(/tokenUtf8|encodedValueUtf8|providerCredential/i);
    });
  });

  describe("POST /v1/orgs/:organizationId/connections/:connectionId/reauth", () => {
    it("forwards reauth to the Runtime deploy", async () => {
      runtime.reauthAppConnection.mockResolvedValue({
        ok: true,
        value: {
          connection: metadataOnlyConnection,
          validation: githubValidation,
          auditEventId: "aud_00000000000000000000000002",
        },
      });

      const response = await authedRequest(reauthPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(200);
      expect(runtime.reauthAppConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          appConnectionId: connectionIdValue,
        }),
      );
    });
  });

  describe("POST /v1/orgs/:organizationId/connections/:connectionId/rotate", () => {
    it("forwards rotate dry-run to the Runtime deploy", async () => {
      runtime.rotateAppConnectionCredential.mockResolvedValue({
        ok: true,
        value: {
          dryRun: true,
          connection: metadataOnlyConnection,
          validation: cloudflareValidation,
          auditEventId: null,
        },
      });

      const response = await authedRequest(rotatePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });

      expect(response.status).toBe(200);
      expect(runtime.rotateAppConnectionCredential).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          appConnectionId: connectionIdValue,
          dryRun: true,
        }),
      );
    });
  });

  describe("POST /v1/orgs/:organizationId/connections/:connectionId/disconnect", () => {
    it("forwards disconnect to the Runtime deploy", async () => {
      runtime.disconnectAppConnection.mockResolvedValue({
        ok: true,
        value: {
          connection: { ...metadataOnlyConnection, status: "disconnected" },
          auditEventId: "aud_00000000000000000000000003",
        },
      });

      const response = await authedRequest(disconnectPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(200);
      expect(runtime.disconnectAppConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          appConnectionId: connectionIdValue,
        }),
      );
    });
  });
});
