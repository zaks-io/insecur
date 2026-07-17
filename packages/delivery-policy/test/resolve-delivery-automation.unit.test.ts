import {
  DELIVERY_POLICY_ERROR_CODES,
  deliveryRiskPolicyId,
  ENVIRONMENT_ERROR_CODES,
  environmentId,
  machineIdentityId,
  organizationId,
  previewAutomationOptInId,
  projectId,
  requestId,
  userId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const environmentStoreMocks = vi.hoisted(() => ({ getById: vi.fn() }));
const policyStoreMocks = vi.hoisted(() => ({
  getPolicyByProject: vi.fn(),
  getPreviewOptInByEnvironment: vi.fn(),
}));
const auditMocks = vi.hoisted(() => ({ recordDeliveryPolicyAudit: vi.fn() }));

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
        getPolicyByProject: policyStoreMocks.getPolicyByProject,
        getPreviewOptInByEnvironment: policyStoreMocks.getPreviewOptInByEnvironment,
      };
    }),
  };
});

vi.mock("../src/record-delivery-policy-audit.js", () => ({
  recordDeliveryPolicyAudit: auditMocks.recordDeliveryPolicyAudit,
}));

import { resolveDeliveryAutomation } from "../src/resolve-delivery-automation.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const OTHER_PROJECT = projectId.brand("prj_00000000000000000000000009");
const ENV = environmentId.brand("env_00000000000000000000000001");
const REQUEST_ID = requestId.brand("req_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");

const USER_ACTOR = { type: "user", userId: USER } as const;
const MACHINE_ACTOR = {
  type: "machine",
  machineIdentityId: machineIdentityId.brand("mach_00000000000000000000000001"),
  tokenScope: { organizationId: ORG },
  credentialScopes: [],
} as const;

const APPROVAL_VERDICT = {
  status: "authorized",
  protectedChangeId: requestId.brand("req_00000000000000000000000009"),
  deliveryTargetKind: "secret_sync_run",
} as const;

function environmentRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    environmentId: ENV,
    organizationId: ORG,
    projectId: PROJECT,
    displayName: "Env",
    lifecycleStage: "preview",
    isProtected: false,
    previewNonProductionOptDown: { confirmedAt: new Date(), confirmedByUserId: USER },
    createdAt: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

function policyRow(presetKey: string, overrides?: Partial<Record<string, unknown>>) {
  return {
    id: deliveryRiskPolicyId.brand("drp_00000000000000000000000001"),
    organizationId: ORG,
    projectId: PROJECT,
    presetKey,
    presetVersion: 1,
    policyVersion: 2,
    selectedByUserId: USER,
    selectedAt: new Date("2026-07-01T00:00:00Z"),
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

function activeOptIn() {
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
  };
}

function input(overrides?: Record<string, unknown>) {
  return {
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: ENV,
    actor: USER_ACTOR,
    requestId: REQUEST_ID,
    ...overrides,
  } as Parameters<typeof resolveDeliveryAutomation>[0];
}

async function expectDenied(
  resolveInput: Parameters<typeof resolveDeliveryAutomation>[0],
  code: string,
) {
  await expect(resolveDeliveryAutomation(resolveInput)).rejects.toMatchObject({ code });
  expect(auditMocks.recordDeliveryPolicyAudit).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "automation_resolution",
      outcome: "denied",
      reasonCode: code,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  environmentStoreMocks.getById.mockResolvedValue(environmentRow());
  policyStoreMocks.getPolicyByProject.mockResolvedValue(policyRow("balanced"));
  policyStoreMocks.getPreviewOptInByEnvironment.mockResolvedValue(null);
  auditMocks.recordDeliveryPolicyAudit.mockResolvedValue(undefined);
});

describe("resolveDeliveryAutomation fail-closed gates", () => {
  it("fails closed when the actor is missing, before any store access", async () => {
    await expect(resolveDeliveryAutomation(input({ actor: undefined }))).rejects.toMatchObject({
      code: DELIVERY_POLICY_ERROR_CODES.actorInvalid,
    });
    expect(environmentStoreMocks.getById).not.toHaveBeenCalled();
    expect(policyStoreMocks.getPolicyByProject).not.toHaveBeenCalled();
  });

  it("fails closed when the environment does not exist", async () => {
    environmentStoreMocks.getById.mockResolvedValue(null);
    await expectDenied(input(), ENVIRONMENT_ERROR_CODES.notFound);
  });

  it("fails closed on a project scope mismatch", async () => {
    environmentStoreMocks.getById.mockResolvedValue(environmentRow({ projectId: OTHER_PROJECT }));
    await expectDenied(input(), DELIVERY_POLICY_ERROR_CODES.scopeInvalid);
  });

  it("fails closed when no delivery risk policy is configured", async () => {
    policyStoreMocks.getPolicyByProject.mockResolvedValue(null);
    await expectDenied(input(), DELIVERY_POLICY_ERROR_CODES.notConfigured);
  });

  it("fails closed on an unsupported stored preset version", async () => {
    policyStoreMocks.getPolicyByProject.mockResolvedValue(
      policyRow("balanced", { presetVersion: 99 }),
    );
    await expectDenied(input(), DELIVERY_POLICY_ERROR_CODES.presetVersionUnsupported);
  });

  it("fails closed on an unknown stored preset", async () => {
    policyStoreMocks.getPolicyByProject.mockResolvedValue(policyRow("legacy_custom"));
    await expectDenied(input(), DELIVERY_POLICY_ERROR_CODES.presetInvalid);
  });

  it("preserves the denial when the denied audit write fails", async () => {
    policyStoreMocks.getPolicyByProject.mockResolvedValue(null);
    auditMocks.recordDeliveryPolicyAudit.mockRejectedValue(new Error("audit sink down"));

    await expect(resolveDeliveryAutomation(input())).rejects.toMatchObject({
      code: DELIVERY_POLICY_ERROR_CODES.notConfigured,
    });
  });
});

describe("protected environments", () => {
  it.each(["strict", "balanced", "automation_friendly"])(
    "denies automation without approval evidence under the %s preset",
    async (preset) => {
      environmentStoreMocks.getById.mockResolvedValue(
        environmentRow({ lifecycleStage: "production", isProtected: true }),
      );
      policyStoreMocks.getPolicyByProject.mockResolvedValue(policyRow(preset));

      await expectDenied(input(), DELIVERY_POLICY_ERROR_CODES.protectedApprovalRequired);
    },
  );

  it("allows execution only through protected delivery approval evidence (INS-87)", async () => {
    environmentStoreMocks.getById.mockResolvedValue(
      environmentRow({ lifecycleStage: "production", isProtected: true }),
    );
    policyStoreMocks.getPolicyByProject.mockResolvedValue(policyRow("automation_friendly"));

    const decision = await resolveDeliveryAutomation(
      input({ protectedDeliveryApproval: APPROVAL_VERDICT }),
    );

    expect(decision.authority).toBe("protected_approval_evidence");
  });

  it("treats a protected preview environment (no opt-down) as protected", async () => {
    environmentStoreMocks.getById.mockResolvedValue(
      environmentRow({ isProtected: true, previewNonProductionOptDown: null }),
    );
    policyStoreMocks.getPolicyByProject.mockResolvedValue(policyRow("automation_friendly"));
    policyStoreMocks.getPreviewOptInByEnvironment.mockResolvedValue(activeOptIn());

    await expectDenied(input(), DELIVERY_POLICY_ERROR_CODES.protectedApprovalRequired);
  });

  it("denies machine actors on protected environments without evidence", async () => {
    environmentStoreMocks.getById.mockResolvedValue(
      environmentRow({ lifecycleStage: "staging", isProtected: true }),
    );

    await expectDenied(
      input({ actor: MACHINE_ACTOR }),
      DELIVERY_POLICY_ERROR_CODES.protectedApprovalRequired,
    );
  });
});

describe("non-protected development environments", () => {
  it.each(["strict", "balanced", "automation_friendly"])(
    "allows development automation under the %s preset",
    async (preset) => {
      environmentStoreMocks.getById.mockResolvedValue(
        environmentRow({ lifecycleStage: "development", previewNonProductionOptDown: null }),
      );
      policyStoreMocks.getPolicyByProject.mockResolvedValue(policyRow(preset));

      const decision = await resolveDeliveryAutomation(input());
      expect(decision).toMatchObject({
        status: "allowed",
        authority: "development_automation",
        preset,
      });
    },
  );
});

describe("non-protected preview environments", () => {
  it("denies preview automation under strict even with an active opt-in", async () => {
    policyStoreMocks.getPolicyByProject.mockResolvedValue(policyRow("strict"));
    policyStoreMocks.getPreviewOptInByEnvironment.mockResolvedValue(activeOptIn());

    await expectDenied(input(), DELIVERY_POLICY_ERROR_CODES.previewAutomationNotAllowed);
    expect(policyStoreMocks.getPreviewOptInByEnvironment).not.toHaveBeenCalled();
  });

  it("requires an explicit opt-in under balanced", async () => {
    await expectDenied(input(), DELIVERY_POLICY_ERROR_CODES.previewOptInRequired);
  });

  it("treats a revoked opt-in as absent under balanced", async () => {
    policyStoreMocks.getPreviewOptInByEnvironment.mockResolvedValue({
      ...activeOptIn(),
      revokedAt: new Date("2026-07-11T00:00:00Z"),
      revokedByUserId: USER,
    });

    await expectDenied(input(), DELIVERY_POLICY_ERROR_CODES.previewOptInRequired);
  });

  it("allows preview automation under balanced with an active opt-in, including machine actors", async () => {
    policyStoreMocks.getPreviewOptInByEnvironment.mockResolvedValue(activeOptIn());

    const decision = await resolveDeliveryAutomation(input({ actor: MACHINE_ACTOR }));

    expect(decision).toMatchObject({
      status: "allowed",
      authority: "preview_automation_opt_in",
      preset: "balanced",
      presetVersion: 1,
      policyVersion: 2,
    });
  });

  it("grants preview automation authority by default under automation_friendly", async () => {
    policyStoreMocks.getPolicyByProject.mockResolvedValue(policyRow("automation_friendly"));

    const decision = await resolveDeliveryAutomation(input());

    expect(decision.authority).toBe("preset_preview_default");
    expect(policyStoreMocks.getPreviewOptInByEnvironment).not.toHaveBeenCalled();
  });
});

describe("audit and metadata safety", () => {
  it("records a metadata-only authorized audit with dotted detail codes", async () => {
    policyStoreMocks.getPreviewOptInByEnvironment.mockResolvedValue(activeOptIn());

    const decision = await resolveDeliveryAutomation(input());

    expect(auditMocks.recordDeliveryPolicyAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "automation_resolution",
        outcome: "success",
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        details: {
          authority: "delivery_policy.authority.preview_automation_opt_in",
          preset: "delivery_policy.preset.balanced",
          presetVersion: 1,
          policyVersion: 2,
        },
      }),
    );

    expect(Object.keys(decision).sort()).toEqual([
      "authority",
      "policyVersion",
      "preset",
      "presetVersion",
      "status",
    ]);
  });
});
