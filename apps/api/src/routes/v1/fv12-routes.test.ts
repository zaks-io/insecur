import { mintEphemeralSessionCredential, testSessionSigningSecret } from "@insecur/auth";
import {
  AUTH_ERROR_CODES,
  CRYPTO_ERROR_CODES,
  INJECTION_ERROR_CODES,
  ONBOARDING_ERROR_CODES,
  SECRET_ERROR_CODES,
  VALIDATION_ERROR_CODES,
  bytesToBase64Url,
  environmentId,
  injectionGrantId,
  organizationId,
  parseVariableKey,
  projectId,
  secretId,
  secretVersionId,
  userId,
  type KnownErrorCode,
  type VariableKey,
} from "@insecur/domain";
import type {
  ConsumeGrantRpcInput,
  RuntimeDeliveryEnvelope,
  RuntimeRpc,
  RuntimeRpcResult,
  RuntimeSecretWritePayload,
  WriteSecretRpcInput,
} from "@insecur/worker-kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMITTED_USER_ID_RAW, WORKOS_USER_ID } from "../../../test/support/setup-unit-auth.js";

const {
  provisionGuidedOrganization,
  issueInjectionGrant,
  resolveEffectiveAccess,
  recordAccessDenial,
  InjectionGrantError,
} = vi.hoisted(() => {
  class InjectionGrantError extends Error {
    readonly code: string;
    readonly retryable: boolean;
    constructor(code: string, message: string, retryable = false) {
      super(message);
      this.name = "InjectionGrantError";
      this.code = code;
      this.retryable = retryable;
    }
  }

  return {
    provisionGuidedOrganization: vi.fn(),
    issueInjectionGrant: vi.fn(),
    resolveEffectiveAccess: vi.fn(),
    recordAccessDenial: vi.fn(),
    InjectionGrantError,
  };
});

vi.mock("@insecur/onboarding", () => ({
  provisionGuidedOrganization,
  GuidedOrganizationProvisionError: class GuidedOrganizationProvisionError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "GuidedOrganizationProvisionError";
      this.code = code;
    }
  },
}));

// Grant issue is metadata-only and stays on the API Worker (no keyring), so it is still mocked here.
vi.mock("@insecur/runtime-injection-issue", () => ({
  issueInjectionGrant,
  InjectionGrantError,
}));

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
const projectIdValue = projectId.brand("prj_00000000000000000000000001");
const environmentIdValue = environmentId.brand("env_00000000000000000000000001");
const grantIdValue = injectionGrantId.brand("igr_00000000000000000000000001");

const RUNTIME_TOKEN_SIGNING_SECRET = "fv12-runtime-hop-secret-00000000000000000000000000";

const VARIABLE_KEY = parseVariableKeyOrThrow("API_KEY");

// The keyring-bound write/consume calls cross the private Service Binding into the Runtime Worker;
// these route unit tests stub that binding with canned RuntimeRpcResult values. The real Runtime
// implementation (authorize + encrypt/decrypt) is exercised by the integration e2e and canary suites.
const writeSecret =
  vi.fn<(input: WriteSecretRpcInput) => Promise<RuntimeRpcResult<RuntimeSecretWritePayload>>>();
const consumeGrant =
  vi.fn<(input: ConsumeGrantRpcInput) => Promise<RuntimeRpcResult<RuntimeDeliveryEnvelope>>>();
const runtimeBinding: RuntimeRpc = { writeSecret, consumeGrant };

const envWithoutInstanceId = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET: testSessionSigningSecret(),
  RUNTIME_TOKEN_SIGNING_SECRET,
  RUNTIME: runtimeBinding,
};

const env = {
  ...envWithoutInstanceId,
  INSTANCE_ID: "inst_FV12_TEST",
};

function parseVariableKeyOrThrow(raw: string): VariableKey {
  const parsed = parseVariableKey(raw);
  if (!parsed.ok) {
    throw new Error(`invalid test variable key: ${raw}`);
  }
  return parsed.value;
}

function rpcFailure(
  code: KnownErrorCode,
  message: string,
  retryable = false,
): RuntimeRpcResult<never> {
  return { ok: false, error: { code, message, retryable } };
}

const successfulWrite: RuntimeRpcResult<RuntimeSecretWritePayload> = {
  ok: true,
  value: {
    secretId: secretId.brand("sec_00000000000000000000000001"),
    secretVersionId: secretVersionId.brand("sv_00000000000000000000000001"),
    variableKey: VARIABLE_KEY,
    createdSecretShape: true,
    auditEventId: "aud_00000000000000000000000001",
  },
};

const successfulConsume: RuntimeRpcResult<RuntimeDeliveryEnvelope> = {
  ok: true,
  value: {
    ok: true,
    delivery: {
      secretId: secretId.brand("sec_00000000000000000000000001"),
      secretVersionId: secretVersionId.brand("sv_00000000000000000000000001"),
      variableKey: VARIABLE_KEY,
      grantId: grantIdValue,
      encodedValueUtf8: bytesToBase64Url(new TextEncoder().encode("runtime-delivery-material")),
      auditEventId: "aud_00000000000000000000000003",
    },
  },
};

const secretsPath = `/v1/orgs/${orgId}/projects/${projectIdValue}/environments/${environmentIdValue}/secrets/by-variable-key`;
const grantsPath = `/v1/orgs/${orgId}/runtime-injection/grants`;
const consumePath = `/v1/orgs/${orgId}/runtime-injection/grants/${grantIdValue}/consume`;

async function authHeaders(): Promise<Record<string, string>> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: admittedUserId,
      workosUserId,
      sessionId: "session_fv12_test",
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
    "Content-Type": "application/json",
  };
}

describe("FV-12 worker routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveEffectiveAccess.mockResolvedValue({
      organizationId: orgId,
      scopes: ["onboarding:guided_organization_provision", "runtime_injection:grant_issue"],
    });
    recordAccessDenial.mockResolvedValue({ auditEventId: "aud_test" });
    writeSecret.mockResolvedValue(successfulWrite);
    consumeGrant.mockResolvedValue(successfulConsume);
  });

  describe("POST /v1/onboarding/personal-organization", () => {
    it("returns auth.required when unauthenticated", async () => {
      const response = await app.request(
        "/v1/onboarding/personal-organization",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
        env,
      );
      expect(response.status).toBe(401);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: false, error: { code: "auth.required" } });
      expect(provisionGuidedOrganization).not.toHaveBeenCalled();
    });

    it("delegates provisioning to the onboarding package", async () => {
      provisionGuidedOrganization.mockResolvedValue({
        organizationId: orgId,
        defaultTeamId: "team_00000000000000000000000001",
        ownerMembershipId: "mem_00000000000000000000000001",
        projectId: projectIdValue,
        developmentEnvironmentId: environmentIdValue,
      });

      const response = await app.request(
        "/v1/onboarding/personal-organization",
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({}),
        },
        env,
      );

      expect(response.status).toBe(200);
      expect(provisionGuidedOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: admittedUserId,
          instanceId: env.INSTANCE_ID,
          isAdmitted: true,
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: true, data: { organizationId: orgId } });
      expect(JSON.stringify(body)).not.toMatch(/plaintext|valueUtf8/i);
    });

    it("uses the worker-kit local development instance fallback when INSTANCE_ID is omitted", async () => {
      provisionGuidedOrganization.mockResolvedValue({
        organizationId: orgId,
        defaultTeamId: "team_00000000000000000000000001",
        ownerMembershipId: "mem_00000000000000000000000001",
        projectId: projectIdValue,
        developmentEnvironmentId: environmentIdValue,
      });

      const response = await app.request(
        "/v1/onboarding/personal-organization",
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({}),
        },
        envWithoutInstanceId,
      );

      expect(response.status).toBe(200);
      expect(provisionGuidedOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceId: "inst_LOCAL_DEV",
        }),
      );
    });

    it("maps onboarding conflicts to error envelopes", async () => {
      const { GuidedOrganizationProvisionError } = await import("@insecur/onboarding");
      provisionGuidedOrganization.mockRejectedValue(
        new GuidedOrganizationProvisionError(
          ONBOARDING_ERROR_CODES.alreadyProvisioned,
          "user already has a guided organization",
          orgId,
        ),
      );

      const response = await app.request(
        "/v1/onboarding/personal-organization",
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({}),
        },
        env,
      );

      expect(response.status).toBe(409);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: ONBOARDING_ERROR_CODES.alreadyProvisioned },
      });
    });
  });

  describe("POST /v1/orgs/:org/projects/.../secrets/by-variable-key", () => {
    it("returns auth.required when unauthenticated", async () => {
      const response = await app.request(
        secretsPath,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            variableKey: "API_KEY",
            value: "metadata-only-test-value",
          }),
        },
        env,
      );

      expect(response.status).toBe(401);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: false, error: { code: "auth.required" } });
      expect(writeSecret).not.toHaveBeenCalled();
    });

    it("rejects missing secret input before forwarding to Runtime", async () => {
      const response = await app.request(
        secretsPath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ variableKey: "API_KEY" }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(writeSecret).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: SECRET_ERROR_CODES.inputRequired },
      });
    });

    it("rejects both value and generate in the request body", async () => {
      const response = await app.request(
        secretsPath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            variableKey: "API_KEY",
            value: "x",
            generate: { mode: "random", lengthBytes: 32 },
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(writeSecret).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: SECRET_ERROR_CODES.invalidInputMode },
      });
    });

    it("rejects named local value files before forwarding to Runtime", async () => {
      const response = await app.request(
        secretsPath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            variableKey: "API_KEY",
            value: "x",
            localValueFile: ".env",
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(writeSecret).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: SECRET_ERROR_CODES.inputRequired },
      });
    });

    it("forwards the write to the Runtime Worker and returns the metadata envelope", async () => {
      const response = await app.request(
        secretsPath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            variableKey: "API_KEY",
            value: "metadata-only-test-value",
          }),
        },
        env,
      );

      expect(response.status).toBe(200);
      expect(writeSecret).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          projectId: projectIdValue,
          environmentId: environmentIdValue,
          variableKey: "API_KEY",
        }),
      );
      // The API mints and forwards a scoped hop token; it never authorizes or logs the value itself.
      const forwarded = writeSecret.mock.calls[0]?.[0];
      expect(forwarded?.actorToken.length).toBeGreaterThan(0);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: true, data: { variableKey: "API_KEY" } });
      expect(JSON.stringify(body)).not.toContain("metadata-only-test-value");
    });

    it("forwards generated writes to Runtime without accepting a request-body value", async () => {
      const response = await app.request(
        secretsPath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            variableKey: "API_KEY",
            generate: { mode: "random", lengthBytes: 32 },
          }),
        },
        env,
      );

      expect(response.status).toBe(200);
      const forwarded = writeSecret.mock.calls[0]?.[0];
      expect(forwarded).toMatchObject({
        organizationId: orgId,
        projectId: projectIdValue,
        environmentId: environmentIdValue,
        variableKey: "API_KEY",
        generate: { mode: "random", lengthBytes: 32 },
      });
      expect(forwarded).not.toHaveProperty("valueUtf8");
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: true, data: { variableKey: "API_KEY" } });
      expect(JSON.stringify(body)).not.toMatch(/valueUtf8|plaintext|secret-value/i);
    });

    it("maps a Runtime insufficient-scope failure to a 403 envelope", async () => {
      writeSecret.mockResolvedValue(
        rpcFailure(AUTH_ERROR_CODES.insufficientScope, "actor lacks secret:non_protected_write"),
      );

      const response = await app.request(
        secretsPath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            variableKey: "API_KEY",
            value: "metadata-only-test-value",
          }),
        },
        env,
      );

      expect(response.status).toBe(403);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: AUTH_ERROR_CODES.insufficientScope },
      });
    });

    it("maps a Runtime secret validation failure without leaking values", async () => {
      writeSecret.mockResolvedValue(
        rpcFailure(SECRET_ERROR_CODES.valueTooLarge, "Secret value is too large."),
      );

      const response = await app.request(
        secretsPath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            variableKey: "API_KEY",
            value: "x",
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: SECRET_ERROR_CODES.valueTooLarge },
      });
    });
  });

  describe("POST /v1/orgs/:org/runtime-injection/grants", () => {
    it("returns auth.required when unauthenticated", async () => {
      const response = await app.request(
        grantsPath,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: projectIdValue,
            environmentId: environmentIdValue,
            variableKey: "API_KEY",
          }),
        },
        env,
      );

      expect(response.status).toBe(401);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: false, error: { code: "auth.required" } });
      expect(issueInjectionGrant).not.toHaveBeenCalled();
    });

    it("rejects missing projectId before delegating grant issue", async () => {
      const response = await app.request(
        grantsPath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            environmentId: environmentIdValue,
            variableKey: "API_KEY",
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(issueInjectionGrant).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: "validation.invalid_opaque_resource_id" },
      });
    });

    it("rejects invalid projectId and environmentId combinations in the body", async () => {
      const invalidProjectResponse = await app.request(
        grantsPath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            projectId: "not-a-project",
            environmentId: environmentIdValue,
            variableKey: "API_KEY",
          }),
        },
        env,
      );

      expect(invalidProjectResponse.status).toBe(400);
      expect(issueInjectionGrant).not.toHaveBeenCalled();
      const invalidProjectBody: unknown = await invalidProjectResponse.json();
      expect(invalidProjectBody).toMatchObject({
        ok: false,
        error: { code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId },
      });

      const invalidEnvironmentResponse = await app.request(
        grantsPath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            projectId: projectIdValue,
            environmentId: "not-an-environment",
            variableKey: "API_KEY",
          }),
        },
        env,
      );

      expect(invalidEnvironmentResponse.status).toBe(400);
      expect(issueInjectionGrant).not.toHaveBeenCalled();
      const invalidEnvironmentBody: unknown = await invalidEnvironmentResponse.json();
      expect(invalidEnvironmentBody).toMatchObject({
        ok: false,
        error: { code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId },
      });
    });

    it("delegates grant issue by variable key to the runtime-injection package", async () => {
      issueInjectionGrant.mockResolvedValue({
        grantId: grantIdValue,
        expiresAt: "2026-06-13T00:00:00.000Z",
        auditEventId: "aud_00000000000000000000000002",
      });

      const response = await app.request(
        grantsPath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            projectId: projectIdValue,
            environmentId: environmentIdValue,
            variableKey: "API_KEY",
          }),
        },
        env,
      );

      expect(response.status).toBe(200);
      expect(issueInjectionGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          selector: { kind: "variable_key", variableKey: "API_KEY" },
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: true, data: { grantId: grantIdValue } });
      expect(JSON.stringify(body)).not.toMatch(/valueUtf8|plaintext/i);
    });

    it("delegates grant issue by secret id without requiring variableKey", async () => {
      const secretIdValue = secretId.brand("sec_00000000000000000000000001");
      issueInjectionGrant.mockResolvedValue({
        grantId: grantIdValue,
        expiresAt: "2026-06-13T00:00:00.000Z",
        auditEventId: "aud_00000000000000000000000002",
      });

      const response = await app.request(
        grantsPath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            projectId: projectIdValue,
            environmentId: environmentIdValue,
            secretId: secretIdValue,
          }),
        },
        env,
      );

      expect(response.status).toBe(200);
      expect(issueInjectionGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          selector: { kind: "secret_id", secretId: secretIdValue },
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: true, data: { grantId: grantIdValue } });
      expect(JSON.stringify(body)).not.toMatch(/valueUtf8|plaintext/i);
    });

    it("rejects grant issue when both variableKey and secretId are present", async () => {
      const response = await app.request(
        grantsPath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            projectId: projectIdValue,
            environmentId: environmentIdValue,
            variableKey: "API_KEY",
            secretId: "sec_00000000000000000000000001",
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(issueInjectionGrant).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: "validation.invalid_opaque_resource_id" },
      });
    });

    it("rejects grant issue when neither variableKey nor secretId is present", async () => {
      const response = await app.request(
        grantsPath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            projectId: projectIdValue,
            environmentId: environmentIdValue,
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(issueInjectionGrant).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: "validation.invalid_opaque_resource_id" },
      });
    });

    it("maps grant issue denials to metadata-only errors", async () => {
      issueInjectionGrant.mockRejectedValue(
        new InjectionGrantError(INJECTION_ERROR_CODES.grantDenied, "injection grant issue denied"),
      );

      const response = await app.request(
        grantsPath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            projectId: projectIdValue,
            environmentId: environmentIdValue,
            variableKey: "API_KEY",
          }),
        },
        env,
      );

      expect(response.status).toBe(404);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: INJECTION_ERROR_CODES.grantDenied },
      });
    });
  });

  describe("POST /v1/orgs/:org/runtime-injection/grants/:grantId/consume", () => {
    it("returns auth.required when unauthenticated", async () => {
      const response = await app.request(
        consumePath,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variableKey: "API_KEY" }),
        },
        env,
      );

      expect(response.status).toBe(401);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: false, error: { code: "auth.required" } });
      expect(consumeGrant).not.toHaveBeenCalled();
    });

    it("rejects invalid grant id path params before forwarding consume", async () => {
      const response = await app.request(
        `/v1/orgs/${orgId}/runtime-injection/grants/not-a-grant/consume`,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ variableKey: "API_KEY" }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(consumeGrant).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: "validation.invalid_opaque_resource_id" },
      });
    });

    it("rejects consume requests with both variableKey and secretId before Runtime RPC", async () => {
      const response = await app.request(
        consumePath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            variableKey: "API_KEY",
            secretId: "sec_00000000000000000000000001",
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(consumeGrant).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId },
      });
    });

    it("rejects consume requests with neither selector before Runtime RPC", async () => {
      const response = await app.request(
        consumePath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({}),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(consumeGrant).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId },
      });
    });

    it("rejects consume requests with blank variableKey and present secretId before Runtime RPC", async () => {
      const response = await app.request(
        consumePath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            variableKey: "",
            secretId: "sec_00000000000000000000000001",
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(consumeGrant).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId },
      });
    });

    it("rejects consume requests with present variableKey and blank secretId before Runtime RPC", async () => {
      const response = await app.request(
        consumePath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            variableKey: "API_KEY",
            secretId: "",
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(consumeGrant).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId },
      });
    });

    it("returns runtime delivery material from the Runtime Worker only on the consume route", async () => {
      const response = await app.request(
        consumePath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ variableKey: "API_KEY" }),
        },
        env,
      );

      expect(response.status).toBe(200);
      expect(consumeGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          grantId: grantIdValue,
          variableKey: "API_KEY",
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        delivery: {
          grantId: grantIdValue,
          variableKey: "API_KEY",
        },
      });
      const delivery = (body as { delivery: { encodedValueUtf8: string } }).delivery;
      expect(delivery.encodedValueUtf8.length).toBeGreaterThan(0);
      expect(JSON.stringify(body)).not.toContain("valueUtf8");
      expect(JSON.stringify(body)).not.toContain("runtime-delivery-material");
    });

    it("forwards consume by secret id to the Runtime Worker", async () => {
      const secretIdValue = secretId.brand("sec_00000000000000000000000001");
      const response = await app.request(
        consumePath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ secretId: secretIdValue }),
        },
        env,
      );

      expect(response.status).toBe(200);
      expect(consumeGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          grantId: grantIdValue,
          secretId: secretIdValue,
        }),
      );
      expect(consumeGrant.mock.calls[0]?.[0]).not.toHaveProperty("variableKey");
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        delivery: {
          grantId: grantIdValue,
          secretId: secretIdValue,
        },
      });
      expect(JSON.stringify(body)).not.toContain("runtime-delivery-material");
    });

    it("maps replay consume failures to grant denied", async () => {
      consumeGrant.mockResolvedValue(
        rpcFailure(INJECTION_ERROR_CODES.grantDenied, "injection grant consume denied"),
      );

      const response = await app.request(
        consumePath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ variableKey: "API_KEY" }),
        },
        env,
      );

      expect(response.status).toBe(404);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: INJECTION_ERROR_CODES.grantDenied },
      });
      expect(JSON.stringify(body)).not.toMatch(/valueUtf8|plaintext/i);
    });

    it("maps expired grants to grant expired", async () => {
      consumeGrant.mockResolvedValue(
        rpcFailure(INJECTION_ERROR_CODES.grantExpired, "injection grant expired"),
      );

      const response = await app.request(
        consumePath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ variableKey: "API_KEY" }),
        },
        env,
      );

      expect(response.status).toBe(404);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: INJECTION_ERROR_CODES.grantExpired },
      });
    });

    it("maps runtime decrypt failures to opaque crypto.decrypt_failed", async () => {
      consumeGrant.mockResolvedValue(
        rpcFailure(CRYPTO_ERROR_CODES.decryptFailed, "decrypt failed"),
      );

      const response = await app.request(
        consumePath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ variableKey: "API_KEY" }),
        },
        env,
      );

      expect(response.status).toBe(500);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: CRYPTO_ERROR_CODES.decryptFailed, retryable: false },
      });
      expect((body as { meta?: { requestId?: string } }).meta?.requestId).toMatch(/^req_/);
      expect(JSON.stringify(body)).not.toMatch(/valueUtf8|plaintext/i);
    });
  });

  describe("validation", () => {
    it("rejects invalid project path params before forwarding to the Runtime Worker", async () => {
      const response = await app.request(
        `/v1/orgs/${orgId}/projects/not-a-project/environments/${environmentIdValue}/secrets/by-variable-key`,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            variableKey: "API_KEY",
            value: "x",
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(writeSecret).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId },
      });
    });

    it("rejects invalid environment path params before forwarding to the Runtime Worker", async () => {
      const response = await app.request(
        `/v1/orgs/${orgId}/projects/${projectIdValue}/environments/not-an-environment/secrets/by-variable-key`,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            variableKey: "API_KEY",
            value: "x",
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(writeSecret).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId },
      });
    });

    it("rejects invalid organization path params before forwarding to the Runtime Worker", async () => {
      const response = await app.request(
        `/v1/orgs/not-an-org/projects/${projectIdValue}/environments/${environmentIdValue}/secrets/by-variable-key`,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            variableKey: "API_KEY",
            value: "x",
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(writeSecret).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId },
      });
    });

    it("rejects invalid variable keys before forwarding to the Runtime Worker", async () => {
      const response = await app.request(
        secretsPath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            variableKey: "bad key",
            value: "x",
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(writeSecret).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: "validation.invalid_variable_key" },
      });
    });
  });
});
