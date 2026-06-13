import { mintEphemeralSessionCredential, testSessionSigningSecret } from "@insecur/auth";
import { DecryptError, PlaintextHandle } from "@insecur/crypto";
import {
  AUTH_ERROR_CODES,
  CRYPTO_ERROR_CODES,
  INJECTION_ERROR_CODES,
  ONBOARDING_ERROR_CODES,
  SECRET_ERROR_CODES,
  environmentId,
  injectionGrantId,
  organizationId,
  projectId,
  secretId,
  secretVersionId,
  userId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  provisionGuidedOrganization,
  writeNonProtectedSecret,
  issueInjectionGrant,
  consumeInjectionGrant,
  resolveEffectiveAccess,
  recordAccessDenial,
} = vi.hoisted(() => ({
  provisionGuidedOrganization: vi.fn(),
  writeNonProtectedSecret: vi.fn(),
  issueInjectionGrant: vi.fn(),
  consumeInjectionGrant: vi.fn(),
  resolveEffectiveAccess: vi.fn(),
  recordAccessDenial: vi.fn(),
}));

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

vi.mock("@insecur/secret-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/secret-store")>();
  return {
    ...actual,
    writeNonProtectedSecret,
  };
});

vi.mock("@insecur/runtime-injection", () => ({
  issueInjectionGrant,
  consumeInjectionGrant,
  InjectionGrantError: class InjectionGrantError extends Error {
    readonly code: string;
    readonly retryable: boolean;
    constructor(code: string, message: string, retryable = false) {
      super(message);
      this.name = "InjectionGrantError";
      this.code = code;
      this.retryable = retryable;
    }
  },
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

const admittedUserId = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const workosUserId = "user_01workos";

const env = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET: testSessionSigningSecret(),
  INSTANCE_ID: "inst_LOCAL_DEV",
  ADMITTED_USER_MAP_JSON: JSON.stringify({ [workosUserId]: admittedUserId }),
  INSTANCE_ROOT_KEY_V1: {
    get: (): Promise<string> =>
      Promise.resolve("0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20"),
  },
};

const orgId = organizationId.brand("org_00000000000000000000000001");
const projectIdValue = projectId.brand("prj_00000000000000000000000001");
const environmentIdValue = environmentId.brand("env_00000000000000000000000001");
const grantIdValue = injectionGrantId.brand("igr_00000000000000000000000001");

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
      scopes: [
        "onboarding:guided_organization_provision",
        "secret:non_protected_write",
        "runtime_injection:grant_issue",
        "runtime_injection:grant_consume",
      ],
    });
    recordAccessDenial.mockResolvedValue({ auditEventId: "aud_test" });
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
          instanceId: "inst_LOCAL_DEV",
          isAdmitted: true,
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: true, data: { organizationId: orgId } });
      expect(JSON.stringify(body)).not.toMatch(/plaintext|valueUtf8/i);
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

  describe("POST /v1/projects/.../secrets/by-variable-key", () => {
    const path = `/v1/projects/${projectIdValue}/environments/${environmentIdValue}/secrets/by-variable-key`;

    it("denies when Effective Access lacks secret write scope", async () => {
      resolveEffectiveAccess.mockResolvedValue({ organizationId: orgId, scopes: [] });

      const response = await app.request(
        path,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            organizationId: orgId,
            variableKey: "API_KEY",
            value: "metadata-only-test-value",
          }),
        },
        env,
      );

      expect(response.status).toBe(403);
      expect(writeNonProtectedSecret).not.toHaveBeenCalled();
      expect(recordAccessDenial).toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: AUTH_ERROR_CODES.insufficientScope },
      });
    });

    it("delegates secret write to the secrets package after scope check", async () => {
      writeNonProtectedSecret.mockResolvedValue({
        secretId: secretId.brand("sec_00000000000000000000000001"),
        secretVersionId: secretVersionId.brand("sv_00000000000000000000000001"),
        variableKey: "API_KEY",
        createdSecretShape: true,
        auditEventId: "aud_00000000000000000000000001",
      });

      const response = await app.request(
        path,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            organizationId: orgId,
            variableKey: "API_KEY",
            value: "metadata-only-test-value",
          }),
        },
        env,
      );

      expect(response.status).toBe(200);
      expect(resolveEffectiveAccess).toHaveBeenCalled();
      const writeInput = writeNonProtectedSecret.mock.calls[0]?.[0] as
        | { keyring?: unknown }
        | undefined;
      expect(writeInput?.keyring).toBeDefined();
      expect(writeNonProtectedSecret).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          projectId: projectIdValue,
          environmentId: environmentIdValue,
          variableKey: "API_KEY",
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: true, data: { variableKey: "API_KEY" } });
      expect(JSON.stringify(body)).not.toContain("metadata-only-test-value");
    });

    it("fails closed when INSTANCE_ROOT_KEY_V1 is missing", async () => {
      const envWithoutRootKey = {
        WORKOS_API_KEY: "sk_test",
        WORKOS_CLIENT_ID: "client_test",
        WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
        SESSION_SIGNING_SECRET: testSessionSigningSecret(),
        INSTANCE_ID: "inst_LOCAL_DEV",
        ADMITTED_USER_MAP_JSON: JSON.stringify({ [workosUserId]: admittedUserId }),
      };

      const response = await app.request(
        path,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            organizationId: orgId,
            variableKey: "API_KEY",
            value: "metadata-only-test-value",
          }),
        },
        envWithoutRootKey,
      );

      expect(response.status).toBe(503);
      expect(writeNonProtectedSecret).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: CRYPTO_ERROR_CODES.rootKeyNotConfigured, retryable: false },
      });
    });

    it("maps secret validation failures without leaking values", async () => {
      const { SecretWriteError } = await import("@insecur/secret-store");
      writeNonProtectedSecret.mockRejectedValue(
        new SecretWriteError(SECRET_ERROR_CODES.valueTooLarge, "Secret value is too large."),
      );

      const response = await app.request(
        path,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            organizationId: orgId,
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

  describe("POST /v1/runtime-injection/grants", () => {
    it("delegates grant issue by variable key to the runtime-injection package", async () => {
      issueInjectionGrant.mockResolvedValue({
        grantId: grantIdValue,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        auditEventId: "aud_00000000000000000000000002",
      });

      const response = await app.request(
        "/v1/runtime-injection/grants",
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            organizationId: orgId,
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
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        auditEventId: "aud_00000000000000000000000002",
      });

      const response = await app.request(
        "/v1/runtime-injection/grants",
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            organizationId: orgId,
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
        "/v1/runtime-injection/grants",
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            organizationId: orgId,
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
        "/v1/runtime-injection/grants",
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            organizationId: orgId,
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
      const { InjectionGrantError } = await import("@insecur/runtime-injection");
      issueInjectionGrant.mockRejectedValue(
        new InjectionGrantError(INJECTION_ERROR_CODES.grantDenied, "injection grant issue denied"),
      );

      const response = await app.request(
        "/v1/runtime-injection/grants",
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            organizationId: orgId,
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

  describe("POST /v1/runtime-injection/grants/:grantId/consume", () => {
    it("returns runtime delivery material only on the consume route", async () => {
      const sensitive = "runtime-delivery-material";
      consumeInjectionGrant.mockResolvedValue({
        secretId: secretId.brand("sec_00000000000000000000000001"),
        secretVersionId: secretVersionId.brand("sv_00000000000000000000000001"),
        variableKey: "API_KEY",
        valueUtf8: new PlaintextHandle(new TextEncoder().encode(sensitive)),
        auditEventId: "aud_00000000000000000000000003",
      });

      const response = await app.request(
        `/v1/runtime-injection/grants/${grantIdValue}/consume`,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            organizationId: orgId,
            variableKey: "API_KEY",
          }),
        },
        env,
      );

      expect(response.status).toBe(200);
      const consumeInput = consumeInjectionGrant.mock.calls[0]?.[0] as
        | { keyring?: unknown }
        | undefined;
      expect(consumeInput?.keyring).toBeDefined();
      expect(consumeInjectionGrant).toHaveBeenCalledWith(
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
      expect(JSON.stringify(body)).not.toContain(sensitive);
    });

    it("maps replay consume failures to grant denied", async () => {
      const { InjectionGrantError } = await import("@insecur/runtime-injection");
      consumeInjectionGrant.mockRejectedValue(
        new InjectionGrantError(
          INJECTION_ERROR_CODES.grantDenied,
          "injection grant consume denied",
        ),
      );

      const response = await app.request(
        `/v1/runtime-injection/grants/${grantIdValue}/consume`,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            organizationId: orgId,
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
      expect(JSON.stringify(body)).not.toMatch(/valueUtf8|plaintext/i);
    });

    it("maps expired grants to grant expired", async () => {
      const { InjectionGrantError } = await import("@insecur/runtime-injection");
      consumeInjectionGrant.mockRejectedValue(
        new InjectionGrantError(INJECTION_ERROR_CODES.grantExpired, "injection grant expired"),
      );

      const response = await app.request(
        `/v1/runtime-injection/grants/${grantIdValue}/consume`,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            organizationId: orgId,
            variableKey: "API_KEY",
          }),
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

    it("fails closed when INSTANCE_ROOT_KEY_V1 is missing", async () => {
      const envWithoutRootKey = {
        WORKOS_API_KEY: "sk_test",
        WORKOS_CLIENT_ID: "client_test",
        WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
        SESSION_SIGNING_SECRET: testSessionSigningSecret(),
        INSTANCE_ID: "inst_LOCAL_DEV",
        ADMITTED_USER_MAP_JSON: JSON.stringify({ [workosUserId]: admittedUserId }),
      };

      const response = await app.request(
        `/v1/runtime-injection/grants/${grantIdValue}/consume`,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            organizationId: orgId,
            variableKey: "API_KEY",
          }),
        },
        envWithoutRootKey,
      );

      expect(response.status).toBe(503);
      expect(consumeInjectionGrant).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: CRYPTO_ERROR_CODES.rootKeyNotConfigured, retryable: false },
      });
    });

    it("maps runtime decrypt failures to opaque crypto.decrypt_failed", async () => {
      consumeInjectionGrant.mockRejectedValue(new DecryptError());

      const response = await app.request(
        `/v1/runtime-injection/grants/${grantIdValue}/consume`,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            organizationId: orgId,
            variableKey: "API_KEY",
          }),
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
    it("rejects invalid path params before calling package seams", async () => {
      const response = await app.request(
        "/v1/projects/not-a-project/environments/env_00000000000000000000000001/secrets/by-variable-key",
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            organizationId: orgId,
            variableKey: "API_KEY",
            value: "x",
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(writeNonProtectedSecret).not.toHaveBeenCalled();
    });
  });
});
