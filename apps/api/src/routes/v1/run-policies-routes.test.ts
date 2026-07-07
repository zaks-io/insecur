import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import {
  AUTH_ERROR_CODES,
  environmentId,
  organizationId,
  parseDisplayName,
  projectId,
  operationId,
  runtimePolicyId,
  runtimePolicyVersionId,
  secretId,
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
const projectIdValue = projectId.brand("prj_00000000000000000000000001");
const environmentIdValue = environmentId.brand("env_00000000000000000000000001");
const policyIdValue = runtimePolicyId.brand("rp_00000000000000000000000001");
const policyVersionIdValue = runtimePolicyVersionId.brand("rpv_00000000000000000000000001");
const secretIdValue = secretId.brand("sec_00000000000000000000000001");
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

const createPath = `/v1/orgs/${orgId}/run-policies`;
const showPath = `/v1/orgs/${orgId}/run-policies/${policyIdValue}`;
const disablePath = `/v1/orgs/${orgId}/run-policies/${policyIdValue}/disable`;

const metadataOnlyVersion = {
  policyVersionId: policyVersionIdValue,
  versionNumber: 1,
  displayNameSnapshot: testDisplayName("dev-web"),
  secretIds: [secretIdValue],
  variableKeys: [] as const,
  command: "npm run deploy",
  commandFingerprint: "sha256:abc",
  ttlSeconds: 300,
  deliveryMode: "environment_variables",
  createdAt: "2026-06-24T00:00:00.000Z",
};

async function authHeaders(env: ReturnType<typeof makeEnv>): Promise<Record<string, string>> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: admittedUserId,
      workosUserId,
      sessionId: "session_run_policies_test",
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
  };
}

describe("run-policies worker routes", () => {
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

  describe("POST /v1/orgs/:organizationId/run-policies", () => {
    it("forwards create to the Runtime deploy with exact secret bindings", async () => {
      runtime.createRuntimeInjectionPolicy.mockResolvedValue({
        ok: true,
        value: {
          policyId: policyIdValue,
          policyVersionId: policyVersionIdValue,
          displayName: testDisplayName("dev-web"),
          activeVersion: metadataOnlyVersion,
          auditEventId: "aud_00000000000000000000000001",
        },
      } satisfies RuntimeRpcResult<unknown>);

      const response = await authedRequest(createPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectIdValue,
          environmentId: environmentIdValue,
          policyId: policyIdValue,
          displayName: "dev-web",
          command: "npm run deploy",
          commandFingerprint: "sha256:abc",
          secretIds: [secretIdValue],
        }),
      });

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: { activeVersion: { secretIds: [secretIdValue] } },
      });
      expect(runtime.createRuntimeInjectionPolicy).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          projectId: projectIdValue,
          environmentId: environmentIdValue,
          policyId: policyIdValue,
          secretIds: [secretIdValue],
        }),
      );
    });

    it("returns auth.high_assurance_required with operationId for protected environments", async () => {
      runtime.createRuntimeInjectionPolicy.mockResolvedValue({
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
          projectId: projectIdValue,
          environmentId: environmentIdValue,
          policyId: policyIdValue,
          displayName: "dev-web",
          command: "npm run deploy",
          secretIds: [secretIdValue],
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

  describe("GET /v1/orgs/:organizationId/run-policies/:policyId", () => {
    it("returns metadata-only policy show payload", async () => {
      runtime.getRuntimeInjectionPolicy.mockResolvedValue({
        ok: true,
        value: {
          policyId: policyIdValue,
          organizationId: orgId,
          projectId: projectIdValue,
          environmentId: environmentIdValue,
          displayName: testDisplayName("dev-web"),
          disabledAt: null,
          createdAt: "2026-06-24T00:00:00.000Z",
          activeVersion: metadataOnlyVersion,
        },
      });

      const response = await authedRequest(showPath, { method: "GET" });
      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: {
          activeVersion: { secretIds: [secretIdValue] },
        },
      });
      if (typeof body === "object" && body !== null && "data" in body) {
        expect(body.data).not.toHaveProperty("encodedValueUtf8");
      }
    });
  });

  describe("POST /v1/orgs/:organizationId/run-policies/:policyId/disable", () => {
    it("forwards disable with audit metadata", async () => {
      runtime.disableRuntimeInjectionPolicy.mockResolvedValue({
        ok: true,
        value: {
          policyId: policyIdValue,
          disabledAt: "2026-06-24T01:00:00.000Z",
          auditEventId: "aud_00000000000000000000000002",
        },
      });

      const response = await authedRequest(disablePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectIdValue,
          environmentId: environmentIdValue,
          comment: "Rotate deployment flow",
        }),
      });

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: { auditEventId: "aud_00000000000000000000000002" },
      });
      expect(runtime.disableRuntimeInjectionPolicy).toHaveBeenCalledWith(
        expect.objectContaining({
          policyId: policyIdValue,
          comment: "Rotate deployment flow",
        }),
      );
    });
  });
});
