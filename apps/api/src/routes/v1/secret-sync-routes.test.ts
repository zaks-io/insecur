import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import {
  appConnectionId,
  environmentId,
  organizationId,
  parseDisplayName,
  projectId,
  requestId,
  secretSyncId,
  userId,
  VALIDATION_ERROR_CODES,
  type DisplayName,
} from "@insecur/domain";
import type { RuntimeRpcResult, SecretSyncMutationRpcPayload } from "@insecur/worker-kit";
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
const appConnectionIdValue = appConnectionId.brand("conn_01JZ8SS12R7M4T0V9X3C5D8F1G");
const secretSyncIdValue = secretSyncId.brand("sync_00000000000000000000000001");
const protectedChangeIdValue = requestId.brand("req_00000000000000000000000608");

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

const basePath = `/v1/orgs/${orgId}/projects/${projectIdValue}/environments/${environmentIdValue}/secret-syncs`;

const syncPayload: SecretSyncMutationRpcPayload = {
  secretSync: {
    id: secretSyncIdValue,
    organizationId: orgId,
    projectId: projectIdValue,
    environmentId: environmentIdValue,
    appConnectionId: appConnectionIdValue,
    displayName: testDisplayName("Preview deploy sync"),
    kind: "github-actions",
    mappingBehavior: "managed",
    autoSyncEnabled: false,
    status: "active",
    githubProviderScope: "repository",
    targetRepoId: "repo_00000000000000000000000001",
    targetGithubEnvironmentId: null,
    hasWorkerScriptTarget: false,
    bindings: [],
    disabledAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
  auditEventId: "aud_00000000000000000000000001",
};

async function authHeaders(env: ReturnType<typeof makeEnv>): Promise<Record<string, string>> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: admittedUserId,
      workosUserId,
      sessionId: "session_secret_sync_test",
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
  };
}

describe("secret-sync worker routes", () => {
  beforeEach(() => {
    runtime = createRuntimeRpcStub();
  });

  async function authedRequest(path: string, init: RequestInit = {}): Promise<Response> {
    const env = makeEnv();
    const headers = new Headers(await authHeaders(env));
    headers.set("Accept", "application/json");
    headers.set("Content-Type", "application/json");
    if (init.headers !== undefined) {
      const extra = new Headers(init.headers);
      extra.forEach((value, key) => {
        headers.set(key, value);
      });
    }
    return app.request(path, { ...init, headers }, env);
  }

  describe("POST .../secret-syncs", () => {
    it("forwards create with protectedChangeId over the RUNTIME seam", async () => {
      runtime.createSecretSync.mockResolvedValue({
        ok: true,
        value: syncPayload,
      } satisfies RuntimeRpcResult<SecretSyncMutationRpcPayload>);

      const response = await authedRequest(basePath, {
        method: "POST",
        body: JSON.stringify({
          appConnectionId: appConnectionIdValue,
          displayName: "Preview deploy sync",
          kind: "github-actions",
          bindings: [
            { secretId: "sec_00000000000000000000000001", providerDestination: "DATABASE_URL" },
          ],
          githubTarget: {
            targetRepoId: "repo_00000000000000000000000001",
            githubProviderScope: "repository",
          },
          protectedChangeId: protectedChangeIdValue,
        }),
      });

      expect(response.status).toBe(200);
      expect(runtime.createSecretSync).toHaveBeenCalledTimes(1);
      const input = runtime.createSecretSync.mock.calls[0]?.[0];
      expect(input).toMatchObject({
        organizationId: orgId,
        projectId: projectIdValue,
        environmentId: environmentIdValue,
        appConnectionId: appConnectionIdValue,
        kind: "github-actions",
        protectedChangeId: protectedChangeIdValue,
      });
      expect(input?.actorToken).toBeTypeOf("string");
    });

    it("omits protectedChangeId when the body does not carry one", async () => {
      runtime.createSecretSync.mockResolvedValue({
        ok: true,
        value: syncPayload,
      } satisfies RuntimeRpcResult<SecretSyncMutationRpcPayload>);

      const response = await authedRequest(basePath, {
        method: "POST",
        body: JSON.stringify({
          appConnectionId: appConnectionIdValue,
          displayName: "Preview deploy sync",
          kind: "github-actions",
          bindings: [
            { secretId: "sec_00000000000000000000000001", providerDestination: "DATABASE_URL" },
          ],
          githubTarget: {
            targetRepoId: "repo_00000000000000000000000001",
            githubProviderScope: "repository",
          },
        }),
      });

      expect(response.status).toBe(200);
      expect(runtime.createSecretSync.mock.calls[0]?.[0]).not.toHaveProperty("protectedChangeId");
    });

    it("never forwards a client-supplied delivery-target fingerprint", async () => {
      runtime.createSecretSync.mockResolvedValue({
        ok: true,
        value: syncPayload,
      } satisfies RuntimeRpcResult<SecretSyncMutationRpcPayload>);

      const response = await authedRequest(basePath, {
        method: "POST",
        body: JSON.stringify({
          appConnectionId: appConnectionIdValue,
          displayName: "Preview deploy sync",
          kind: "github-actions",
          bindings: [
            { secretId: "sec_00000000000000000000000001", providerDestination: "DATABASE_URL" },
          ],
          githubTarget: {
            targetRepoId: "repo_00000000000000000000000001",
            githubProviderScope: "repository",
          },
          protectedChangeId: protectedChangeIdValue,
          deliveryTargetFingerprint: "sha256:forged-client-fingerprint",
        }),
      });

      expect(response.status).toBe(200);
      const forwarded = runtime.createSecretSync.mock.calls[0]?.[0] as unknown as Record<
        string,
        unknown
      >;
      expect(forwarded).not.toHaveProperty("deliveryTargetFingerprint");
      expect(JSON.stringify(forwarded)).not.toContain("forged-client-fingerprint");
    });

    it("rejects a malformed protectedChangeId at the edge", async () => {
      const response = await authedRequest(basePath, {
        method: "POST",
        body: JSON.stringify({
          appConnectionId: appConnectionIdValue,
          displayName: "Preview deploy sync",
          kind: "github-actions",
          bindings: [
            { secretId: "sec_00000000000000000000000001", providerDestination: "DATABASE_URL" },
          ],
          githubTarget: {
            targetRepoId: "repo_00000000000000000000000001",
            githubProviderScope: "repository",
          },
          protectedChangeId: "not-an-opaque-id",
        }),
      });

      expect(response.status).toBe(400);
      const body: { error?: { code?: string } } = await response.json();
      expect(body.error?.code).toBe(VALIDATION_ERROR_CODES.invalidOpaqueResourceId);
      expect(runtime.createSecretSync).not.toHaveBeenCalled();
    });

    it("rejects a create without bindings", async () => {
      const response = await authedRequest(basePath, {
        method: "POST",
        body: JSON.stringify({
          appConnectionId: appConnectionIdValue,
          displayName: "Preview deploy sync",
          kind: "github-actions",
        }),
      });

      expect(response.status).toBe(400);
      expect(runtime.createSecretSync).not.toHaveBeenCalled();
    });
  });

  describe("PATCH .../secret-syncs/:secretSyncId", () => {
    it("forwards update with protectedChangeId over the RUNTIME seam", async () => {
      runtime.updateSecretSync.mockResolvedValue({
        ok: true,
        value: syncPayload,
      } satisfies RuntimeRpcResult<SecretSyncMutationRpcPayload>);

      const response = await authedRequest(`${basePath}/${secretSyncIdValue}`, {
        method: "PATCH",
        body: JSON.stringify({
          autoSyncEnabled: true,
          protectedChangeId: protectedChangeIdValue,
        }),
      });

      expect(response.status).toBe(200);
      expect(runtime.updateSecretSync).toHaveBeenCalledTimes(1);
      expect(runtime.updateSecretSync.mock.calls[0]?.[0]).toMatchObject({
        organizationId: orgId,
        projectId: projectIdValue,
        environmentId: environmentIdValue,
        secretSyncId: secretSyncIdValue,
        autoSyncEnabled: true,
        protectedChangeId: protectedChangeIdValue,
      });
    });

    it("rejects an invalid secret sync id in the path", async () => {
      const response = await authedRequest(`${basePath}/not-a-sync-id`, {
        method: "PATCH",
        body: JSON.stringify({ autoSyncEnabled: true }),
      });

      expect(response.status).toBe(400);
      expect(runtime.updateSecretSync).not.toHaveBeenCalled();
    });
  });
});
