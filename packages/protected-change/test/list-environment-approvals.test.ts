import {
  approvalRequestId,
  AUTH_ERROR_CODES,
  environmentId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import { AUTHORIZATION_SCOPES } from "@insecur/access";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@insecur/access", () => ({
  AUTHORIZATION_SCOPES: {
    environmentRead: "environment:read",
    secretProtectedDraftWrite: "secret:protected_draft_write",
  },
  hasAuthorizationScope: vi.fn((access: { scopes: string[] }, scope: string) =>
    access.scopes.includes(scope),
  ),
  resolveEffectiveAccess: vi.fn(),
}));

vi.mock("@insecur/tenant-store", () => ({
  TenantApprovalRequestStore: vi.fn(),
  withTenantScope: vi.fn(),
}));

import { resolveEffectiveAccess } from "@insecur/access";
import { TenantApprovalRequestStore, withTenantScope } from "@insecur/tenant-store";
import { assertSecretProtectedMutationAccess } from "../src/assert-secret-protected-mutation-access.js";
import { listEnvironmentApprovals } from "../src/list-environment-approvals.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const REQUEST = approvalRequestId.brand("apr_00000000000000000000000001");
const ACTOR = { type: "user" as const, userId: USER };
const NOW = new Date("2026-07-08T00:00:00.000Z");

describe("listEnvironmentApprovals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies callers without environment read scope", async () => {
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({
      organizationId: ORG,
      scopes: [],
    });

    await expect(
      listEnvironmentApprovals({
        actor: ACTOR,
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
  });

  it("returns metadata-only approval rows", async () => {
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({
      organizationId: ORG,
      scopes: [AUTHORIZATION_SCOPES.environmentRead],
    });
    const listEnvironmentApprovalRequests = vi.fn().mockResolvedValue([
      {
        approvalRequestId: REQUEST,
        purpose: "protected_promotion",
        status: "pending",
        createdAt: NOW,
        operationId: "op_00000000000000000000000001",
      },
    ]);
    vi.mocked(TenantApprovalRequestStore).mockImplementation(function MockStore() {
      return {
        listEnvironmentApprovalRequests,
      } as never;
    });
    vi.mocked(withTenantScope).mockImplementation(async (_scope, callback) =>
      callback({ db: {} } as never),
    );

    await expect(
      listEnvironmentApprovals({
        actor: ACTOR,
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
      }),
    ).resolves.toEqual([
      {
        approvalRequestId: REQUEST,
        purpose: "protected_promotion",
        status: "pending",
        createdAt: NOW.toISOString(),
        operationId: "op_00000000000000000000000001",
      },
    ]);
  });
});

describe("assertSecretProtectedMutationAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies callers without protected draft write scope", async () => {
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({
      organizationId: ORG,
      scopes: [],
    });

    await expect(
      assertSecretProtectedMutationAccess(ACTOR, {
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
  });

  it("allows callers with protected draft write scope", async () => {
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({
      organizationId: ORG,
      scopes: [AUTHORIZATION_SCOPES.secretProtectedDraftWrite],
    });

    await expect(
      assertSecretProtectedMutationAccess(ACTOR, {
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
      }),
    ).resolves.toBeUndefined();
  });
});
