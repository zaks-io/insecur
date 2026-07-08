import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret, type FakeWorkOSSessionEntry } from "@insecur/auth/testing";
import { CREDENTIAL_SCOPES } from "@insecur/access";
import { mintMachineAccessToken } from "@insecur/machine-auth";
import {
  APPROVAL_ERROR_CODES,
  AUTH_ERROR_CODES,
  approvalRequestId,
  environmentId,
  machineIdentityId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import type { KnownErrorCode } from "@insecur/domain";
import type { RuntimeRpcResult } from "@insecur/worker-kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRuntimeRpcStub,
  type RuntimeRpcStub,
} from "../../../test/support/runtime-rpc-stub.js";
import { ADMITTED_USER_ID_RAW, WORKOS_USER_ID } from "../../../test/support/setup-unit-auth.js";

import app from "../../index.js";

vi.mock("@insecur/worker-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/worker-kit")>();
  const { createFakeWorkOSSessionPort } = await import("@insecur/auth/testing");
  return {
    ...actual,
    createAuthContext: (
      env: Parameters<typeof actual.createAuthContext>[0],
      options?: Parameters<typeof actual.createAuthContext>[1],
    ) => {
      const fakeSessions = (
        env as { readonly WORKOS_TEST_FAKE_SESSIONS?: readonly FakeWorkOSSessionEntry[] }
      ).WORKOS_TEST_FAKE_SESSIONS;
      return actual.createAuthContext(env, {
        ...options,
        ...(fakeSessions === undefined
          ? {}
          : { workos: createFakeWorkOSSessionPort(fakeSessions) }),
      });
    },
  };
});

const admittedUserId = userId.brand(ADMITTED_USER_ID_RAW);
const workosUserId = WORKOS_USER_ID;
const sessionId = "session_approval_request_test";
const orgId = organizationId.brand("org_00000000000000000000000001");
const approvalRequestIdValue = approvalRequestId.brand("apr_00000000000000000000000001");
const projectIdValue = projectId.brand("prj_00000000000000000000000001");
const environmentIdValue = environmentId.brand("env_00000000000000000000000001");
const machineId = machineIdentityId.brand("mach_00000000000000000000000002");
const machineAccessSigningSecret = "machine-access-signing-secret-00000000000000000000000000";

let runtime: RuntimeRpcStub;

function makeEnv() {
  return {
    WORKOS_API_KEY: "sk_test",
    WORKOS_CLIENT_ID: "client_test",
    WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
    SESSION_SIGNING_SECRET: testSessionSigningSecret(),
    INSTANCE_ID: "inst_LOCAL_DEV",
    RUNTIME_TOKEN_SIGNING_SECRET: "runtime-hop-secret-00000000000000000000000000",
    MACHINE_ACCESS_SIGNING_SECRET: machineAccessSigningSecret,
    RUNTIME: runtime,
  };
}

const listPath = `/v1/orgs/${orgId}/approval-requests`;
const detailPath = `/v1/orgs/${orgId}/approval-requests/${approvalRequestIdValue}`;
const rejectPath = `${detailPath}/reject`;

const metadataOnlyApprovalRequest = {
  approvalRequestId: approvalRequestIdValue,
  purpose: "protected_promotion",
  status: "pending",
  projectId: projectIdValue,
  environmentId: environmentIdValue,
  requestedAt: "2026-06-24T00:00:00.000Z",
  operationId: null,
  requestingUserId: admittedUserId,
  requestingMachineIdentityId: null,
  organizationId: orgId,
  commentLength: null,
  rollbackSecretId: null,
  rollbackToVersionId: null,
  rollbackPromoteRequested: false,
  impactReview: {
    fingerprintAtCreation: "fp-old",
    currentFingerprint: "fp-current",
    isStale: false,
    draftVersions: [],
    delivery: { runtimeInjectionPolicies: [], providerSyncImpact: [] },
  },
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
      sessionId,
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
  };
}

async function machineAuthHeaders(
  env: ReturnType<typeof makeEnv>,
): Promise<Record<string, string>> {
  const minted = await mintMachineAccessToken({
    machineIdentityId: machineId,
    organizationId: orgId,
    projectId: projectIdValue,
    credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
    signingSecret: env.MACHINE_ACCESS_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.accessToken}`,
  };
}

describe("approval-requests routes", () => {
  beforeEach(() => {
    runtime = createRuntimeRpcStub();
  });

  it("lists pending approval requests for authorized humans", async () => {
    runtime.listPendingApprovalRequests.mockResolvedValue({
      ok: true,
      value: { approvalRequests: [metadataOnlyApprovalRequest] },
    });

    const env = makeEnv();
    const response = await app.request(
      listPath,
      {
        method: "GET",
        headers: await authHeaders(env),
      },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: {
        approvalRequests: [expect.objectContaining({ approvalRequestId: approvalRequestIdValue })],
      },
    });
  });

  it("returns metadata-only detail for one approval request", async () => {
    runtime.getApprovalRequestReview.mockResolvedValue({
      ok: true,
      value: { approvalRequest: metadataOnlyApprovalRequest },
    });

    const env = makeEnv();
    const response = await app.request(
      detailPath,
      {
        method: "GET",
        headers: await authHeaders(env),
      },
      env,
    );
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: { approvalRequest: metadataOnlyApprovalRequest },
    });
    expect(JSON.stringify(body)).not.toMatch(/password|secret.*value/i);
  });

  it("rejects a pending approval request without step-up", async () => {
    runtime.getApprovalRequestReview.mockResolvedValue({
      ok: true,
      value: { approvalRequest: metadataOnlyApprovalRequest },
    });
    runtime.rejectApprovalRequest.mockResolvedValue({
      ok: true,
      value: { approvalRequestId: approvalRequestIdValue, status: "rejected" },
    });

    const env = makeEnv();
    const response = await app.request(
      rejectPath,
      {
        method: "POST",
        headers: await authHeaders(env),
      },
      env,
    );
    expect(response.status).toBe(200);
    expect(runtime.rejectApprovalRequest).toHaveBeenCalledTimes(1);
  });

  it("masks unauthorized reads as approval.request_not_found", async () => {
    runtime.getApprovalRequestReview.mockResolvedValue(
      rpcFailure(APPROVAL_ERROR_CODES.requestNotFound, "approval request not found"),
    );

    const env = makeEnv();
    const response = await app.request(
      detailPath,
      {
        method: "GET",
        headers: await authHeaders(env),
      },
      env,
    );
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: APPROVAL_ERROR_CODES.requestNotFound },
    });
  });

  it("rejects machine tokens", async () => {
    const env = makeEnv();
    const response = await app.request(
      listPath,
      { method: "GET", headers: await machineAuthHeaders(env) },
      env,
    );
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code: AUTH_ERROR_CODES.invalid } });
    expect(runtime.listPendingApprovalRequests).not.toHaveBeenCalled();
  });
});
