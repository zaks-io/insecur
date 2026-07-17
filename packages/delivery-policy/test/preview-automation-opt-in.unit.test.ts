import {
  AUTH_ERROR_CODES,
  DELIVERY_POLICY_ERROR_CODES,
  ENVIRONMENT_ERROR_CODES,
  environmentId,
  machineIdentityId,
  operationId,
  organizationId,
  previewAutomationOptInId,
  projectId,
  requestId,
  userId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const accessMocks = vi.hoisted(() => ({ authorizeScopeOrThrow: vi.fn() }));
const environmentStoreMocks = vi.hoisted(() => ({ getById: vi.fn() }));
const policyStoreMocks = vi.hoisted(() => ({
  enablePreviewOptIn: vi.fn(),
  revokePreviewOptIn: vi.fn(),
}));
const auditMocks = vi.hoisted(() => ({ recordDeliveryPolicyAudit: vi.fn() }));
const evidenceMocks = vi.hoisted(() => ({ consumeDeliveryPolicyChangeEvidence: vi.fn() }));

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return { ...actual, authorizeScopeOrThrow: accessMocks.authorizeScopeOrThrow };
});

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(
      async (_scope: unknown, callback: (handles: { db: unknown; sql: unknown }) => unknown) =>
        callback({ db: {}, sql: {} }),
    ),
    TenantEnvironmentLifecycleStore: vi.fn(function MockEnvironmentStore() {
      return { getById: environmentStoreMocks.getById };
    }),
    TenantDeliveryPolicyStore: vi.fn(function MockPolicyStore() {
      return {
        enablePreviewOptIn: policyStoreMocks.enablePreviewOptIn,
        revokePreviewOptIn: policyStoreMocks.revokePreviewOptIn,
      };
    }),
  };
});

vi.mock("../src/record-delivery-policy-audit.js", () => ({
  recordDeliveryPolicyAudit: auditMocks.recordDeliveryPolicyAudit,
}));

vi.mock("../src/consume-delivery-policy-change-evidence.js", () => ({
  consumeDeliveryPolicyChangeEvidence: evidenceMocks.consumeDeliveryPolicyChangeEvidence,
}));

import { enablePreviewAutomationOptIn } from "../src/enable-preview-automation-opt-in.js";
import { revokePreviewAutomationOptIn } from "../src/revoke-preview-automation-opt-in.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const OTHER_PROJECT = projectId.brand("prj_00000000000000000000000009");
const ENV = environmentId.brand("env_00000000000000000000000001");
const REQUEST_ID = requestId.brand("req_00000000000000000000000001");
const OPERATION_ID = operationId.brand("op_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");

const USER_ACTOR = { type: "user", userId: USER } as const;
const MACHINE_ACTOR = {
  type: "machine",
  machineIdentityId: machineIdentityId.brand("mach_00000000000000000000000001"),
  tokenScope: { organizationId: ORG },
  credentialScopes: [],
} as const;

function environmentRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    environmentId: ENV,
    organizationId: ORG,
    projectId: PROJECT,
    displayName: "Preview",
    lifecycleStage: "preview",
    isProtected: false,
    previewNonProductionOptDown: { confirmedAt: new Date(), confirmedByUserId: USER },
    createdAt: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

function optInRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: previewAutomationOptInId.brand("pao_00000000000000000000000001"),
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: ENV,
    enabledByUserId: USER,
    enabledAt: new Date("2026-07-10T00:00:00Z"),
    revokedAt: null,
    revokedByUserId: null,
    createdAt: new Date("2026-07-10T00:00:00Z"),
    updatedAt: new Date("2026-07-10T00:00:00Z"),
    ...overrides,
  };
}

function enableInput(overrides?: Record<string, unknown>) {
  return {
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: ENV,
    actor: USER_ACTOR,
    requestId: REQUEST_ID,
    highAssuranceOperationId: OPERATION_ID,
    ...overrides,
  } as Parameters<typeof enablePreviewAutomationOptIn>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  accessMocks.authorizeScopeOrThrow.mockResolvedValue(undefined);
  environmentStoreMocks.getById.mockResolvedValue(environmentRow());
  policyStoreMocks.enablePreviewOptIn.mockResolvedValue(optInRow());
  policyStoreMocks.revokePreviewOptIn.mockResolvedValue(
    optInRow({ revokedAt: new Date("2026-07-11T00:00:00Z"), revokedByUserId: USER }),
  );
  auditMocks.recordDeliveryPolicyAudit.mockResolvedValue(undefined);
  evidenceMocks.consumeDeliveryPolicyChangeEvidence.mockResolvedValue(undefined);
});

function expectDeniedAudit(action: string, code: string) {
  expect(auditMocks.recordDeliveryPolicyAudit).toHaveBeenCalledWith(
    expect.objectContaining({ action, outcome: "denied", reasonCode: code }),
  );
}

describe("enablePreviewAutomationOptIn", () => {
  it("denies machine actors: opt-in enablement is never agent-reachable (ADR-0043)", async () => {
    await expect(
      enablePreviewAutomationOptIn(enableInput({ actor: MACHINE_ACTOR })),
    ).rejects.toMatchObject({ code: DELIVERY_POLICY_ERROR_CODES.actorInvalid });
    expectDeniedAudit("preview_opt_in_enable", DELIVERY_POLICY_ERROR_CODES.actorInvalid);
    expect(policyStoreMocks.enablePreviewOptIn).not.toHaveBeenCalled();
  });

  it("fails closed when the environment does not exist", async () => {
    environmentStoreMocks.getById.mockResolvedValue(null);

    await expect(enablePreviewAutomationOptIn(enableInput())).rejects.toMatchObject({
      code: ENVIRONMENT_ERROR_CODES.notFound,
    });
    expectDeniedAudit("preview_opt_in_enable", ENVIRONMENT_ERROR_CODES.notFound);
  });

  it("fails closed when the environment belongs to a different project", async () => {
    environmentStoreMocks.getById.mockResolvedValue(environmentRow({ projectId: OTHER_PROJECT }));

    await expect(enablePreviewAutomationOptIn(enableInput())).rejects.toMatchObject({
      code: DELIVERY_POLICY_ERROR_CODES.scopeInvalid,
    });
  });

  it("rejects development environments: development automation needs no opt-in", async () => {
    environmentStoreMocks.getById.mockResolvedValue(
      environmentRow({ lifecycleStage: "development", previewNonProductionOptDown: null }),
    );

    await expect(enablePreviewAutomationOptIn(enableInput())).rejects.toMatchObject({
      code: DELIVERY_POLICY_ERROR_CODES.optInEnvironmentInvalid,
    });
  });

  it("rejects protected preview environments: they require approval evidence, never opt-ins", async () => {
    environmentStoreMocks.getById.mockResolvedValue(
      environmentRow({ isProtected: true, previewNonProductionOptDown: null }),
    );

    await expect(enablePreviewAutomationOptIn(enableInput())).rejects.toMatchObject({
      code: DELIVERY_POLICY_ERROR_CODES.optInEnvironmentInvalid,
    });
    expect(evidenceMocks.consumeDeliveryPolicyChangeEvidence).not.toHaveBeenCalled();
  });

  it("requires high-assurance evidence: enabling an opt-in is always risk-broadening", async () => {
    await expect(
      enablePreviewAutomationOptIn(enableInput({ highAssuranceOperationId: undefined })),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.highAssuranceRequired });
    expect(policyStoreMocks.enablePreviewOptIn).not.toHaveBeenCalled();
  });

  it("records who enabled the opt-in and when", async () => {
    const optIn = await enablePreviewAutomationOptIn(enableInput());

    expect(evidenceMocks.consumeDeliveryPolicyChangeEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ environmentId: ENV, operationId: OPERATION_ID }),
    );
    expect(policyStoreMocks.enablePreviewOptIn).toHaveBeenCalledWith(
      expect.objectContaining({ environmentId: ENV, enabledByUserId: USER }),
    );
    const storeInput = policyStoreMocks.enablePreviewOptIn.mock.calls[0]?.[0] as {
      optInId: string;
    };
    expect(storeInput.optInId).toMatch(/^pao_/);
    expect(optIn.enabledByUserId).toBe(USER);
    expect(optIn.enabledAt).toBeInstanceOf(Date);
    expect(auditMocks.recordDeliveryPolicyAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "preview_opt_in_enable",
        outcome: "success",
        environmentId: ENV,
        details: { optInActive: true },
      }),
    );
  });

  it("requires delivery_policy:manage at the exact environment coordinate", async () => {
    accessMocks.authorizeScopeOrThrow.mockRejectedValue(
      Object.assign(new Error("denied"), { code: AUTH_ERROR_CODES.insufficientScope }),
    );

    await expect(enablePreviewAutomationOptIn(enableInput())).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });
    expect(accessMocks.authorizeScopeOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        coordinate: { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
        requiredScope: "delivery_policy:manage",
      }),
    );
  });
});

describe("revokePreviewAutomationOptIn", () => {
  function revokeInput(overrides?: Record<string, unknown>) {
    return {
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      actor: USER_ACTOR,
      requestId: REQUEST_ID,
      ...overrides,
    } as Parameters<typeof revokePreviewAutomationOptIn>[0];
  }

  it("revokes without step-up (risk-tightening) and records who revoked", async () => {
    const revoked = await revokePreviewAutomationOptIn(revokeInput());

    expect(evidenceMocks.consumeDeliveryPolicyChangeEvidence).not.toHaveBeenCalled();
    expect(policyStoreMocks.revokePreviewOptIn).toHaveBeenCalledWith({
      organizationId: ORG,
      environmentId: ENV,
      revokedByUserId: USER,
    });
    expect(revoked.revokedAt).toBeInstanceOf(Date);
    expect(revoked.revokedByUserId).toBe(USER);
    expect(auditMocks.recordDeliveryPolicyAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "preview_opt_in_revoke",
        outcome: "success",
        details: { optInActive: false },
      }),
    );
  });

  it("fails closed when no active opt-in exists", async () => {
    policyStoreMocks.revokePreviewOptIn.mockResolvedValue(null);

    await expect(revokePreviewAutomationOptIn(revokeInput())).rejects.toMatchObject({
      code: DELIVERY_POLICY_ERROR_CODES.optInNotFound,
    });
    expectDeniedAudit("preview_opt_in_revoke", DELIVERY_POLICY_ERROR_CODES.optInNotFound);
  });

  it("denies machine actors", async () => {
    await expect(
      revokePreviewAutomationOptIn(revokeInput({ actor: MACHINE_ACTOR })),
    ).rejects.toMatchObject({ code: DELIVERY_POLICY_ERROR_CODES.actorInvalid });
  });

  it("fails closed on a project scope mismatch", async () => {
    environmentStoreMocks.getById.mockResolvedValue(environmentRow({ projectId: OTHER_PROJECT }));

    await expect(revokePreviewAutomationOptIn(revokeInput())).rejects.toMatchObject({
      code: DELIVERY_POLICY_ERROR_CODES.scopeInvalid,
    });
    expect(policyStoreMocks.revokePreviewOptIn).not.toHaveBeenCalled();
  });
});
