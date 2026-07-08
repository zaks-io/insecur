import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import {
  AUTH_ERROR_CODES,
  SECRET_ERROR_CODES,
  environmentId,
  organizationId,
  parseDisplayName,
  projectId,
  secretId,
  secretVersionId,
  userId,
  type DisplayName,
  type VariableKey,
} from "@insecur/domain";
import type { KnownErrorCode } from "@insecur/domain";
import type { RuntimeRpcResult } from "@insecur/worker-kit";
import { computeSecretWriteDescriptiveVerdicts } from "@insecur/secret-store-contracts";
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
const projectIdValue = projectId.brand("prj_00000000000000000000000001");
const otherProjectId = projectId.brand("prj_00000000000000000000000002");
const environmentIdValue = environmentId.brand("env_00000000000000000000000001");
const otherEnvironmentId = environmentId.brand("env_00000000000000000000000002");

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

const listProjectsPath = `/v1/orgs/${orgId}/projects`;
const crossTenantProjectsPath = `/v1/orgs/${otherOrgId}/projects`;
const listEnvironmentsPath = `/v1/orgs/${orgId}/projects/${projectIdValue}/environments`;
const listProjectSecretsPath = `/v1/orgs/${orgId}/projects/${projectIdValue}/secrets`;
const listEnvironmentSecretsPath = `/v1/orgs/${orgId}/projects/${projectIdValue}/environments/${environmentIdValue}/secrets`;
const listSecretVersionsPath = `/v1/orgs/${orgId}/projects/${projectIdValue}/environments/${environmentIdValue}/secrets/sec_00000000000000000000000001/versions`;
const crossTenantEnvironmentSecretsPath = `/v1/orgs/${otherOrgId}/projects/${otherProjectId}/environments/${environmentIdValue}/secrets`;
const crossEnvironmentSecretsPath = `/v1/orgs/${orgId}/projects/${projectIdValue}/environments/${otherEnvironmentId}/secrets`;
const crossTenantSecretVersionsPath = `/v1/orgs/${otherOrgId}/projects/${otherProjectId}/environments/${environmentIdValue}/secrets/sec_00000000000000000000000001/versions`;
const crossEnvironmentSecretVersionsPath = `/v1/orgs/${orgId}/projects/${projectIdValue}/environments/${otherEnvironmentId}/secrets/sec_00000000000000000000000001/versions`;
const crossTenantProjectSecretsPath = `/v1/orgs/${otherOrgId}/projects/${otherProjectId}/secrets`;

function testDisplayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`invalid fixture display name: ${raw}`);
  }
  return parsed.value;
}

const metadataOnlyProject = {
  projectId: projectIdValue,
  organizationId: orgId,
  displayName: testDisplayName("Synthetic project"),
  createdAt: "2026-06-24T00:00:00.000Z",
};

const metadataOnlyEnvironment = {
  environmentId: environmentIdValue,
  organizationId: orgId,
  projectId: projectIdValue,
  displayName: testDisplayName("Synthetic env"),
  lifecycleStage: "development" as const,
  isProtected: false,
  createdAt: "2026-06-24T00:00:00.000Z",
};

const matrixVariableKey = "DATABASE_URL" as VariableKey;

const metadataOnlySecretsMatrix = {
  environments: [metadataOnlyEnvironment],
  rows: [
    {
      variableKey: matrixVariableKey,
      cells: [
        {
          environmentId: environmentIdValue,
          present: true,
          secretId: secretId.brand("sec_00000000000000000000000001"),
          versionNumber: 2,
          secretVersionId: secretVersionId.brand("sv_00000000000000000000000001"),
          lifecycleState: "live" as const,
          lastSetAt: "2026-06-24T01:00:00.000Z",
          lastSetActor: {
            actorType: "user" as const,
            userId: admittedUserId,
          },
        },
      ],
    },
  ],
};

const testDescriptiveVerdicts = computeSecretWriteDescriptiveVerdicts({
  valueUtf8: new TextEncoder().encode("test-secret"),
});

const metadataOnlyEnvironmentSecret = {
  secretId: secretId.brand("sec_00000000000000000000000001"),
  variableKey: matrixVariableKey,
  displayName: testDisplayName("DATABASE_URL"),
  currentVersion: {
    secretVersionId: secretVersionId.brand("sv_00000000000000000000000001"),
    versionNumber: 2,
    lifecycleState: "live" as const,
    createdAt: "2026-06-24T01:00:00.000Z",
    publishedAt: "2026-06-24T01:00:00.000Z",
    descriptiveVerdicts: testDescriptiveVerdicts,
  },
  createdAt: "2026-06-24T00:00:00.000Z",
};

const metadataOnlySecretVersions = {
  secretId: secretId.brand("sec_00000000000000000000000001"),
  variableKey: matrixVariableKey,
  versions: [
    {
      secretVersionId: secretVersionId.brand("sv_00000000000000000000000001"),
      versionNumber: 2,
      lifecycleState: "live" as const,
      createdAt: "2026-06-24T01:00:00.000Z",
      publishedAt: "2026-06-24T01:00:00.000Z",
      isCurrent: true,
      isPublished: true,
      descriptiveVerdicts: testDescriptiveVerdicts,
    },
  ],
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
      sessionId: "session_project_metadata_test",
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
  };
}

describe("project metadata worker routes", () => {
  beforeEach(() => {
    runtime = createRuntimeRpcStub();
    runtime.listProjects.mockResolvedValue({
      ok: true,
      value: { projects: [metadataOnlyProject] },
    });
    runtime.listEnvironments.mockResolvedValue({
      ok: true,
      value: { environments: [metadataOnlyEnvironment] },
    });
    runtime.listProjectSecrets.mockResolvedValue({
      ok: true,
      value: metadataOnlySecretsMatrix,
    });
    runtime.listEnvironmentSecrets.mockResolvedValue({
      ok: true,
      value: { secrets: [metadataOnlyEnvironmentSecret] },
    });
    runtime.listSecretVersions.mockResolvedValue({
      ok: true,
      value: metadataOnlySecretVersions,
    });
  });

  describe("GET /v1/orgs/:organizationId/projects", () => {
    it("returns auth.required when unauthenticated", async () => {
      const env = makeEnv();
      const response = await app.request(listProjectsPath, { method: "GET" }, env);

      expect(response.status).toBe(401);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: false, error: { code: "auth.required" } });
      expect(runtime.listProjects).not.toHaveBeenCalled();
    });

    it("forwards the read to the Runtime Worker and returns metadata-only projects", async () => {
      const env = makeEnv();
      const response = await app.request(
        listProjectsPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(200);
      expect(runtime.listProjects).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: orgId }),
      );
      const forwarded = runtime.listProjects.mock.calls[0]?.[0];
      expect(forwarded?.actorToken.length).toBeGreaterThan(0);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: { projects: [metadataOnlyProject] },
      });
      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/slug|valueUtf8|plaintext|secret|password/i);
    });

    it("returns an empty projects array for an empty org", async () => {
      const env = makeEnv();
      runtime.listProjects.mockResolvedValue({ ok: true, value: { projects: [] } });

      const response = await app.request(
        listProjectsPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: true, data: { projects: [] } });
    });

    it("maps insufficient-scope denials to auth.insufficient_scope", async () => {
      const env = makeEnv();
      runtime.listProjects.mockResolvedValue(
        rpcFailure(AUTH_ERROR_CODES.insufficientScope, "actor lacks project:read"),
      );

      const response = await app.request(
        listProjectsPath,
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

    it("tenant-qualifies cross-tenant reads through the Runtime seam", async () => {
      const env = makeEnv();
      runtime.listProjects.mockResolvedValue(
        rpcFailure(AUTH_ERROR_CODES.insufficientScope, "organization membership required"),
      );

      const response = await app.request(
        crossTenantProjectsPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(403);
      expect(runtime.listProjects).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: otherOrgId }),
      );
    });
  });

  describe("GET /v1/orgs/:organizationId/projects/:projectId/environments", () => {
    it("returns auth.required when unauthenticated", async () => {
      const env = makeEnv();
      const response = await app.request(listEnvironmentsPath, { method: "GET" }, env);

      expect(response.status).toBe(401);
      expect(runtime.listEnvironments).not.toHaveBeenCalled();
    });

    it("forwards the read and returns metadata-only environments with protection flags", async () => {
      const env = makeEnv();
      const response = await app.request(
        listEnvironmentsPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(200);
      expect(runtime.listEnvironments).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          projectId: projectIdValue,
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: {
          environments: [
            expect.objectContaining({
              environmentId: environmentIdValue,
              isProtected: false,
            }),
          ],
        },
      });
    });

    it("maps insufficient-scope denials to auth.insufficient_scope", async () => {
      const env = makeEnv();
      runtime.listEnvironments.mockResolvedValue(
        rpcFailure(AUTH_ERROR_CODES.insufficientScope, "actor lacks environment:read"),
      );

      const response = await app.request(
        listEnvironmentsPath,
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

    it("rejects invalid project id parameters", async () => {
      const env = makeEnv();
      const response = await app.request(
        `/v1/orgs/${orgId}/projects/not-a-project-id/environments`,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(400);
      expect(runtime.listEnvironments).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: "validation.invalid_opaque_resource_id" },
      });
    });
  });

  describe("GET /v1/orgs/:organizationId/projects/:projectId/secrets", () => {
    it("returns auth.required when unauthenticated", async () => {
      const env = makeEnv();
      const response = await app.request(listProjectSecretsPath, { method: "GET" }, env);

      expect(response.status).toBe(401);
      expect(runtime.listProjectSecrets).not.toHaveBeenCalled();
    });

    it("forwards the read and returns metadata-only matrix rows without ciphertext", async () => {
      const env = makeEnv();
      const response = await app.request(
        listProjectSecretsPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(200);
      expect(runtime.listProjectSecrets).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          projectId: projectIdValue,
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: metadataOnlySecretsMatrix,
      });
      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/ciphertext|valueUtf8|plaintext|password|wrapped/i);
    });

    it("denies cross-tenant secrets matrix reads for another organization and project", async () => {
      const env = makeEnv();
      runtime.listProjectSecrets.mockResolvedValue(
        rpcFailure(AUTH_ERROR_CODES.insufficientScope, "organization membership required"),
      );

      const response = await app.request(
        crossTenantProjectSecretsPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(403);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: AUTH_ERROR_CODES.insufficientScope },
      });
      expect(runtime.listProjectSecrets).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: otherOrgId,
          projectId: otherProjectId,
        }),
      );
      expect(JSON.stringify(body)).not.toMatch(/ciphertext|valueUtf8|plaintext|password|wrapped/i);
    });

    it("maps insufficient-scope denials to auth.insufficient_scope", async () => {
      const env = makeEnv();
      runtime.listProjectSecrets.mockResolvedValue(
        rpcFailure(AUTH_ERROR_CODES.insufficientScope, "actor lacks secret:read"),
      );

      const response = await app.request(
        listProjectSecretsPath,
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

    it("rejects invalid project id parameters", async () => {
      const env = makeEnv();
      const response = await app.request(
        `/v1/orgs/${orgId}/projects/not-a-project-id/secrets`,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(400);
      expect(runtime.listProjectSecrets).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: "validation.invalid_opaque_resource_id" },
      });
    });
  });

  describe("POST /v1/orgs/:organizationId/projects", () => {
    const createProjectPath = `/v1/orgs/${orgId}/projects`;

    it("forwards create to the Runtime Worker with opaque id and display name", async () => {
      const env = makeEnv();
      runtime.createProject.mockResolvedValue({
        ok: true,
        value: {
          projectId: projectIdValue,
          organizationId: orgId,
          displayName: testDisplayName("Created project"),
          createdAt: "2026-06-24T00:00:00.000Z",
        },
      });

      const response = await app.request(
        createProjectPath,
        {
          method: "POST",
          headers: {
            ...(await authHeaders(env)),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectId: projectIdValue,
            displayName: "Created project",
          }),
        },
        env,
      );

      expect(response.status).toBe(200);
      expect(runtime.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          projectId: projectIdValue,
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: {
          projectId: projectIdValue,
          displayName: testDisplayName("Created project"),
        },
      });
    });

    it("tenant-qualifies cross-tenant project creates through the Runtime seam", async () => {
      const env = makeEnv();
      runtime.createProject.mockResolvedValue(
        rpcFailure(AUTH_ERROR_CODES.insufficientScope, "organization membership required"),
      );

      const response = await app.request(
        `/v1/orgs/${otherOrgId}/projects`,
        {
          method: "POST",
          headers: {
            ...(await authHeaders(env)),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectId: otherProjectId,
            displayName: "Foreign project",
          }),
        },
        env,
      );

      expect(response.status).toBe(403);
      expect(runtime.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: otherOrgId }),
      );
    });
  });

  describe("POST /v1/orgs/:organizationId/projects/:projectId/environments", () => {
    const createEnvironmentPath = `/v1/orgs/${orgId}/projects/${projectIdValue}/environments`;

    it("forwards environment create with optional shape copy source", async () => {
      const env = makeEnv();
      const sourceEnvironmentId = environmentId.brand("env_00000000000000000000000002");
      runtime.createEnvironment.mockResolvedValue({
        ok: true,
        value: {
          environmentId: environmentIdValue,
          organizationId: orgId,
          projectId: projectIdValue,
          displayName: testDisplayName("Created env"),
          lifecycleStage: "development",
          isProtected: false,
          createdAt: "2026-06-24T00:00:00.000Z",
          copiedShapeCount: 1,
        },
      });

      const response = await app.request(
        createEnvironmentPath,
        {
          method: "POST",
          headers: {
            ...(await authHeaders(env)),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            environmentId: environmentIdValue,
            displayName: "Created env",
            copyShapesFromEnvironmentId: sourceEnvironmentId,
          }),
        },
        env,
      );

      expect(response.status).toBe(200);
      expect(runtime.createEnvironment).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          projectId: projectIdValue,
          environmentId: environmentIdValue,
          copyShapesFromEnvironmentId: sourceEnvironmentId,
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: {
          copiedShapeCount: 1,
        },
      });
      expect(JSON.stringify(body)).not.toMatch(/valueUtf8|ciphertext|plaintext|password/i);
    });
  });

  describe("GET /v1/orgs/:organizationId/projects/:projectId/environments/:environmentId/secrets", () => {
    it("forwards the env-scoped read and returns metadata-only secrets without values", async () => {
      const env = makeEnv();
      const response = await app.request(
        listEnvironmentSecretsPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(200);
      expect(runtime.listEnvironmentSecrets).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          projectId: projectIdValue,
          environmentId: environmentIdValue,
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: { secrets: [metadataOnlyEnvironmentSecret] },
      });
      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/ciphertext|valueUtf8|plaintext|password|wrapped/i);
    });

    it("denies cross-tenant environment secret list reads", async () => {
      const env = makeEnv();
      runtime.listEnvironmentSecrets.mockResolvedValue(
        rpcFailure(AUTH_ERROR_CODES.insufficientScope, "organization membership required"),
      );

      const response = await app.request(
        crossTenantEnvironmentSecretsPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(403);
      expect(runtime.listEnvironmentSecrets).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: otherOrgId,
          projectId: otherProjectId,
          environmentId: environmentIdValue,
        }),
      );
    });

    it("denies cross-environment secret list reads for a secret outside the requested environment", async () => {
      const env = makeEnv();
      runtime.listEnvironmentSecrets.mockResolvedValue(
        rpcFailure(SECRET_ERROR_CODES.coordinateInvalid, "secret not found"),
      );

      const response = await app.request(
        crossEnvironmentSecretsPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(404);
      expect(runtime.listEnvironmentSecrets).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          projectId: projectIdValue,
          environmentId: otherEnvironmentId,
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: SECRET_ERROR_CODES.coordinateInvalid },
      });
    });
  });

  describe("GET /v1/orgs/:organizationId/projects/:projectId/environments/:environmentId/secrets/:secretId/versions", () => {
    it("forwards the versions read and returns metadata-only version rows", async () => {
      const env = makeEnv();
      const response = await app.request(
        listSecretVersionsPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(200);
      expect(runtime.listSecretVersions).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          projectId: projectIdValue,
          environmentId: environmentIdValue,
          secretId: secretId.brand("sec_00000000000000000000000001"),
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: metadataOnlySecretVersions,
      });
      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/ciphertext|valueUtf8|plaintext|password|wrapped/i);
    });

    it("denies cross-tenant secret version list reads", async () => {
      const env = makeEnv();
      runtime.listSecretVersions.mockResolvedValue(
        rpcFailure(AUTH_ERROR_CODES.insufficientScope, "organization membership required"),
      );

      const response = await app.request(
        crossTenantSecretVersionsPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(403);
      expect(runtime.listSecretVersions).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: otherOrgId,
          projectId: otherProjectId,
          environmentId: environmentIdValue,
          secretId: secretId.brand("sec_00000000000000000000000001"),
        }),
      );
    });

    it("denies cross-environment secret version list reads for a secret outside the requested environment", async () => {
      const env = makeEnv();
      runtime.listSecretVersions.mockResolvedValue(
        rpcFailure(SECRET_ERROR_CODES.coordinateInvalid, "secret not found"),
      );

      const response = await app.request(
        crossEnvironmentSecretVersionsPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(404);
      expect(runtime.listSecretVersions).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          projectId: projectIdValue,
          environmentId: otherEnvironmentId,
          secretId: secretId.brand("sec_00000000000000000000000001"),
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: SECRET_ERROR_CODES.coordinateInvalid },
      });
    });
  });
});
