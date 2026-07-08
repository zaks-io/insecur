import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import {
  AUTH_ERROR_CODES,
  APPROVAL_ERROR_CODES,
  approvalRequestId,
  environmentId,
  organizationId,
  projectId,
  operationId,
  secretId,
  secretVersionId,
  userId,
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
const projectIdValue = projectId.brand("prj_00000000000000000000000001");
const environmentIdValue = environmentId.brand("env_00000000000000000000000001");
const secretIdValue = secretId.brand("sec_00000000000000000000000001");
const draftVersionIdValue = secretVersionId.brand("sv_00000000000000000000000001");
const operationIdValue = operationId.brand("op_00000000000000000000000001");
const approvalRequestIdValue = approvalRequestId.brand("apr_00000000000000000000000001");

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

const promotePath = `/v1/orgs/${orgId}/projects/${projectIdValue}/environments/${environmentIdValue}/promote`;
const rollbackPath = `/v1/orgs/${orgId}/projects/${projectIdValue}/environments/${environmentIdValue}/secrets/${secretIdValue}/rollback`;
const approvalsPath = `/v1/orgs/${orgId}/projects/${projectIdValue}/environments/${environmentIdValue}/approvals`;
const approvePath = `/v1/orgs/${orgId}/projects/${projectIdValue}/environments/${environmentIdValue}/approvals/${approvalRequestIdValue}/approve`;
const rejectPath = `/v1/orgs/${orgId}/projects/${projectIdValue}/environments/${environmentIdValue}/approvals/${approvalRequestIdValue}/reject`;

async function authHeaders(env: ReturnType<typeof makeEnv>): Promise<Record<string, string>> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: admittedUserId,
      workosUserId,
      sessionId: "session_protected_change_test",
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
  };
}

describe("protected-change worker routes", () => {
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

  describe("POST .../promote", () => {
    it("forwards exact draft version ids to the Runtime deploy", async () => {
      runtime.requestProtectedPromotion.mockResolvedValue({
        ok: true,
        value: {
          approvalRequestId: approvalRequestIdValue,
          impactReviewFingerprint: "sha256:fp",
          supersededApprovalRequestIds: [],
          draftVersionIds: [draftVersionIdValue],
        },
      } satisfies RuntimeRpcResult<unknown>);

      const response = await authedRequest(promotePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftVersionIds: [draftVersionIdValue],
          comment: "Promote staged config",
        }),
      });

      expect(response.status).toBe(200);
      expect(runtime.requestProtectedPromotion).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          projectId: projectIdValue,
          environmentId: environmentIdValue,
          draftVersionIds: [draftVersionIdValue],
        }),
      );
    });

    it("rejects wildcard draft selection at the API edge", async () => {
      const response = await authedRequest(promotePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftVersionIds: ["*"] }),
      });

      expect(response.status).toBe(400);
      const body: { error?: { code?: string } } = await response.json();
      expect(body.error?.code).toBe(APPROVAL_ERROR_CODES.wildcardSelectionRejected);
      expect(runtime.requestProtectedPromotion).not.toHaveBeenCalled();
    });

    it("returns auth.high_assurance_required with operationId for protected environments", async () => {
      runtime.requestProtectedPromotion.mockResolvedValue({
        ok: false,
        error: {
          code: AUTH_ERROR_CODES.highAssuranceRequired,
          message: "high-assurance challenge required",
          retryable: false,
          operationId: operationIdValue,
        },
      });

      const response = await authedRequest(promotePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftVersionIds: [draftVersionIdValue] }),
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

  describe("POST .../secrets/:secret/rollback", () => {
    it("forwards per-secret rollback to the Runtime deploy", async () => {
      runtime.requestProtectedRollback.mockResolvedValue({
        ok: true,
        value: {
          secretId: secretIdValue,
          secretVersionId: draftVersionIdValue,
          versionNumber: 3,
          lifecycleState: "draft",
        },
      } satisfies RuntimeRpcResult<unknown>);

      const response = await authedRequest(rollbackPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toVersionId: draftVersionIdValue,
          promote: true,
          comment: "Emergency rollback",
        }),
      });

      expect(response.status).toBe(200);
      expect(runtime.requestProtectedRollback).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          secretId: secretIdValue,
          toVersionId: draftVersionIdValue,
          promoteRequested: true,
        }),
      );
    });
  });

  describe("GET .../approvals", () => {
    it("returns metadata-only approval list items", async () => {
      runtime.listEnvironmentApprovals.mockResolvedValue({
        ok: true,
        value: {
          approvals: [
            {
              approvalRequestId: approvalRequestIdValue,
              purpose: "protected_promotion",
              status: "pending",
              createdAt: "2026-07-08T00:00:00.000Z",
              operationId: operationIdValue,
            },
          ],
        },
      } satisfies RuntimeRpcResult<unknown>);

      const response = await authedRequest(approvalsPath);
      expect(response.status).toBe(200);
      const body: { data?: { approvals?: Record<string, unknown>[] } } = await response.json();
      expect(body.data?.approvals?.[0]).toEqual({
        approvalRequestId: approvalRequestIdValue,
        purpose: "protected_promotion",
        status: "pending",
        createdAt: "2026-07-08T00:00:00.000Z",
        operationId: operationIdValue,
      });
      expect(body.data?.approvals?.[0]).not.toHaveProperty("variableKeys");
      expect(body.data?.approvals?.[0]).not.toHaveProperty("displayName");
    });
  });

  describe("POST .../approvals/:approval/approve", () => {
    it("fails closed for CLI callers with auth.high_assurance_required", async () => {
      const response = await authedRequest(approvePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(401);
      const body: { error?: { code?: string } } = await response.json();
      expect(body.error?.code).toBe(AUTH_ERROR_CODES.highAssuranceRequired);
    });
  });

  describe("POST .../approvals/:approval/reject", () => {
    it("fails closed for CLI callers with auth.high_assurance_required", async () => {
      const response = await authedRequest(rejectPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(401);
      const body: { error?: { code?: string } } = await response.json();
      expect(body.error?.code).toBe(AUTH_ERROR_CODES.highAssuranceRequired);
    });
  });
});
