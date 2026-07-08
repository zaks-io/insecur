import { afterEach, describe, expect, it, vi } from "vitest";

import { runApprovalsListCommand } from "../src/commands/approvals-list.js";
import { runSecretsPromoteCommand } from "../src/commands/secrets-promote.js";
import { runSecretsRollbackCommand } from "../src/commands/secrets-rollback.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import type { ApiClient } from "../src/api/types.js";
import { clearMemorySession, setMemorySession } from "../src/session/memory-session.js";

const ORG_ID = "org_01TEST00000000000000000001";
const PROJECT_ID = "prj_01TEST00000000000000000001";
const ENV_ID = "env_01TEST00000000000000000001";
const SECRET_ID = "sec_01TEST00000000000000000001";
const APPROVAL_ID = "apr_01TEST00000000000000000001";

const flags = {
  host: "https://insecur.test",
  orgId: ORG_ID as never,
  projectId: PROJECT_ID as never,
  envId: ENV_ID as never,
  profile: undefined,
  profileId: undefined,
  configDir: undefined,
  json: true,
  quiet: true,
  verbose: false,
};

const mockContext: ResolvedCliContext = {
  projectConfig: null,
  userConfig: { profiles: {} },
  scope: {
    host: flags.host,
    orgId: ORG_ID as never,
    projectId: PROJECT_ID as never,
    envId: ENV_ID as never,
    profileId: undefined,
    profileSlug: undefined,
    profile: undefined,
  },
};

function createProtectedChangeMockApi(overrides: Partial<ApiClient> = {}): ApiClient & {
  requestProtectedPromotion: ReturnType<typeof vi.fn>;
  requestProtectedRollback: ReturnType<typeof vi.fn>;
  listEnvironmentApprovals: ReturnType<typeof vi.fn>;
} {
  const requestProtectedPromotion = vi.fn(async () => ({
    ok: true as const,
    envelope: {
      ok: true as const,
      data: {
        approvalRequestId: APPROVAL_ID,
        changeSetId: "pcs_01TEST00000000000000000001",
      },
      meta: { requestId: "req_test" as never },
    },
  }));
  const requestProtectedRollback = vi.fn(async () => ({
    ok: true as const,
    envelope: {
      ok: true as const,
      data: {
        secretId: SECRET_ID,
        versionNumber: 2,
        lifecycleState: "draft",
        secretVersionId: "sv_01TEST00000000000000000001",
      },
      meta: { requestId: "req_test" as never },
    },
  }));
  const listEnvironmentApprovals = vi.fn(async () => ({
    ok: true as const,
    envelope: {
      ok: true as const,
      data: {
        approvals: [
          {
            approvalRequestId: APPROVAL_ID,
            state: "pending_approval",
            createdAt: "2026-07-01T00:00:00.000Z",
          },
        ],
      },
      meta: { requestId: "req_test" as never },
    },
  }));

  return {
    createCliAuthorizationUrl: () => "https://insecur.test/v1/auth/cli/authorize",
    exchangeCliPkceSession: async () => {
      throw new Error("not used");
    },
    provisionPersonalOrganization: async () => {
      throw new Error("not used");
    },
    writeSecretByVariableKey: async () => {
      throw new Error("not used");
    },
    issueInjectionGrant: async () => {
      throw new Error("not used");
    },
    consumeInjectionGrant: async () => {
      throw new Error("not used");
    },
    consumeInjectionGrantAll: async () => {
      throw new Error("not used");
    },
    requestProtectedPromotion,
    requestProtectedRollback,
    listEnvironmentApprovals,
    ...overrides,
  };
}

describe("protected change CLI commands", () => {
  afterEach(() => {
    clearMemorySession();
    delete process.env.INSECUR_SESSION_TOKEN;
    vi.restoreAllMocks();
  });

  it("promotes staged drafts through the API client", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createProtectedChangeMockApi();

    const exitCode = await runSecretsPromoteCommand(flags, api, mockContext, {
      envId: ENV_ID,
      draftVersionIds: ["sv_01TEST00000000000000000001"],
      comment: "ready",
      impactReviewFingerprint: undefined,
      operationId: undefined,
    });

    expect(exitCode).toBe(0);
    expect(api.requestProtectedPromotion).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        environmentId: ENV_ID,
        draftVersionIds: ["sv_01TEST00000000000000000001"],
        comment: "ready",
      }),
    );
  });

  it("rolls back a secret and can request promotion", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createProtectedChangeMockApi();

    const exitCode = await runSecretsRollbackCommand(flags, api, mockContext, {
      secretId: SECRET_ID,
      envId: ENV_ID,
      toVersionId: "sv_01TEST00000000000000000001",
      promote: true,
      comment: undefined,
      operationId: undefined,
    });

    expect(exitCode).toBe(0);
    expect(api.requestProtectedRollback).toHaveBeenCalledWith(
      expect.objectContaining({
        secretId: SECRET_ID,
        toVersionId: "sv_01TEST00000000000000000001",
        promote: true,
      }),
    );
  });

  it("rejects the old ordinal --to-version form and requires an sv_ version id (B3)", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createProtectedChangeMockApi();

    // The pre-spec CLI took `--to-version <n>` (an ordinal like "3"). The spec requires the stable
    // `sv_`-prefixed version id, so an ordinal must be rejected before any API call is made.
    await expect(
      runSecretsRollbackCommand(flags, api, mockContext, {
        secretId: SECRET_ID,
        envId: ENV_ID,
        toVersionId: "3",
        promote: true,
        comment: undefined,
        operationId: undefined,
      }),
    ).rejects.toThrow(/--to-version-id/);

    expect(api.requestProtectedRollback).not.toHaveBeenCalled();
  });

  it("lists environment approval requests", async () => {
    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const api = createProtectedChangeMockApi();

    const exitCode = await runApprovalsListCommand(flags, api, mockContext, {
      envId: ENV_ID,
    });

    expect(exitCode).toBe(0);
    expect(api.listEnvironmentApprovals).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        environmentId: ENV_ID,
      }),
    );
  });
});
