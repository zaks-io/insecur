import {
  AUTH_ERROR_CODES,
  DELIVERY_POLICY_ERROR_CODES,
  deliveryRiskPolicyId,
  machineIdentityId,
  operationId,
  organizationId,
  projectId,
  requestId,
  userId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const accessMocks = vi.hoisted(() => ({ authorizeScopeOrThrow: vi.fn() }));
const storeMocks = vi.hoisted(() => ({
  getPolicyByProject: vi.fn(),
  upsertPolicy: vi.fn(),
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
    TenantDeliveryPolicyStore: vi.fn(function MockStore() {
      return {
        getPolicyByProject: storeMocks.getPolicyByProject,
        upsertPolicy: storeMocks.upsertPolicy,
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

import { selectDeliveryRiskPolicyPreset } from "../src/select-delivery-risk-policy-preset.js";
import { DeliveryPolicyError } from "../src/delivery-policy-error.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const REQUEST_ID = requestId.brand("req_00000000000000000000000001");
const OPERATION_ID = operationId.brand("op_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const POLICY_ID = deliveryRiskPolicyId.brand("drp_00000000000000000000000001");

const USER_ACTOR = { type: "user", userId: USER } as const;
const MACHINE_ACTOR = {
  type: "machine",
  machineIdentityId: machineIdentityId.brand("mach_00000000000000000000000001"),
  tokenScope: { organizationId: ORG },
  credentialScopes: [],
} as const;

function policyRow(presetKey: string, policyVersion = 1) {
  return {
    id: POLICY_ID,
    organizationId: ORG,
    projectId: PROJECT,
    presetKey,
    presetVersion: 1,
    policyVersion,
    selectedByUserId: USER,
    selectedAt: new Date("2026-07-01T00:00:00Z"),
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
  };
}

function baseInput(overrides?: Record<string, unknown>) {
  return {
    organizationId: ORG,
    projectId: PROJECT,
    preset: "balanced",
    presetVersion: 1,
    actor: USER_ACTOR,
    requestId: REQUEST_ID,
    ...overrides,
  } as Parameters<typeof selectDeliveryRiskPolicyPreset>[0];
}

async function expectDeniedWith(
  input: Parameters<typeof selectDeliveryRiskPolicyPreset>[0],
  code: string,
) {
  await expect(selectDeliveryRiskPolicyPreset(input)).rejects.toMatchObject({ code });
  expect(auditMocks.recordDeliveryPolicyAudit).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "preset_selection",
      outcome: "denied",
      reasonCode: code,
    }),
  );
  expect(storeMocks.upsertPolicy).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  accessMocks.authorizeScopeOrThrow.mockResolvedValue(undefined);
  storeMocks.getPolicyByProject.mockResolvedValue(null);
  storeMocks.upsertPolicy.mockResolvedValue(policyRow("balanced"));
  auditMocks.recordDeliveryPolicyAudit.mockResolvedValue(undefined);
  evidenceMocks.consumeDeliveryPolicyChangeEvidence.mockResolvedValue(undefined);
});

describe("selectDeliveryRiskPolicyPreset", () => {
  it("denies machine actors before any scope or store access (ADR-0043)", async () => {
    await expectDeniedWith(
      baseInput({ actor: MACHINE_ACTOR }),
      DELIVERY_POLICY_ERROR_CODES.actorInvalid,
    );
    expect(accessMocks.authorizeScopeOrThrow).not.toHaveBeenCalled();
  });

  it("fails closed on an unknown preset", async () => {
    await expectDeniedWith(
      baseInput({ preset: "yolo" }),
      DELIVERY_POLICY_ERROR_CODES.presetInvalid,
    );
  });

  it("fails closed on an unsupported preset version", async () => {
    await expectDeniedWith(
      baseInput({ presetVersion: 99 }),
      DELIVERY_POLICY_ERROR_CODES.presetVersionUnsupported,
    );
    await expectDeniedWith(
      baseInput({ presetVersion: 0 }),
      DELIVERY_POLICY_ERROR_CODES.presetVersionUnsupported,
    );
  });

  it("requires delivery_policy:manage at the exact project coordinate", async () => {
    const scopeDenied = Object.assign(new Error("denied"), {
      code: AUTH_ERROR_CODES.insufficientScope,
    });
    accessMocks.authorizeScopeOrThrow.mockRejectedValue(scopeDenied);

    await expectDeniedWith(baseInput(), AUTH_ERROR_CODES.insufficientScope);
    expect(accessMocks.authorizeScopeOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        coordinate: { organizationId: ORG, projectId: PROJECT },
        requiredScope: "delivery_policy:manage",
      }),
    );
  });

  it("creates the first policy record without step-up when selecting the balanced default", async () => {
    const selected = await selectDeliveryRiskPolicyPreset(baseInput());

    expect(evidenceMocks.consumeDeliveryPolicyChangeEvidence).not.toHaveBeenCalled();
    expect(storeMocks.upsertPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        projectId: PROJECT,
        presetKey: "balanced",
        presetVersion: 1,
        selectedByUserId: USER,
      }),
    );
    const upsertInput = storeMocks.upsertPolicy.mock.calls[0]?.[0] as { policyId: string };
    expect(upsertInput.policyId).toMatch(/^drp_/);
    expect(selected.presetKey).toBe("balanced");
  });

  it("treats risk-tightening changes as step-up free but still audited", async () => {
    storeMocks.getPolicyByProject.mockResolvedValue(policyRow("automation_friendly", 3));
    storeMocks.upsertPolicy.mockResolvedValue({ ...policyRow("strict", 4) });

    const selected = await selectDeliveryRiskPolicyPreset(baseInput({ preset: "strict" }));

    expect(evidenceMocks.consumeDeliveryPolicyChangeEvidence).not.toHaveBeenCalled();
    expect(selected.policyVersion).toBe(4);
    expect(auditMocks.recordDeliveryPolicyAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "preset_selection",
        outcome: "success",
        details: {
          preset: "delivery_policy.preset.strict",
          presetVersion: 1,
          policyVersion: 4,
          riskBroadening: false,
        },
      }),
    );
  });

  it("requires high-assurance evidence for a risk-broadening change", async () => {
    storeMocks.getPolicyByProject.mockResolvedValue(policyRow("balanced"));

    await expectDeniedWith(
      baseInput({ preset: "automation_friendly" }),
      AUTH_ERROR_CODES.highAssuranceRequired,
    );
  });

  it("treats first-time automation_friendly as broadening from the balanced default", async () => {
    storeMocks.getPolicyByProject.mockResolvedValue(null);

    await expectDeniedWith(
      baseInput({ preset: "automation_friendly" }),
      AUTH_ERROR_CODES.highAssuranceRequired,
    );
  });

  it("consumes delivery-policy high-assurance evidence for a broadening change", async () => {
    storeMocks.getPolicyByProject.mockResolvedValue(policyRow("balanced", 2));
    storeMocks.upsertPolicy.mockResolvedValue(policyRow("automation_friendly", 3));

    const selected = await selectDeliveryRiskPolicyPreset(
      baseInput({ preset: "automation_friendly", highAssuranceOperationId: OPERATION_ID }),
    );

    expect(evidenceMocks.consumeDeliveryPolicyChangeEvidence).toHaveBeenCalledWith({
      organizationId: ORG,
      projectId: PROJECT,
      operationId: OPERATION_ID,
      actor: USER_ACTOR,
    });
    expect(selected.presetKey).toBe("automation_friendly");
    expect(auditMocks.recordDeliveryPolicyAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "success",
        details: expect.objectContaining({ riskBroadening: true }),
      }),
    );
  });

  it("fails closed when evidence consumption is denied", async () => {
    storeMocks.getPolicyByProject.mockResolvedValue(policyRow("strict"));
    evidenceMocks.consumeDeliveryPolicyChangeEvidence.mockRejectedValue(
      Object.assign(new Error("mismatch"), { code: "high_assurance.operation_mismatch" }),
    );

    await expectDeniedWith(
      baseInput({ preset: "balanced", highAssuranceOperationId: OPERATION_ID }),
      "high_assurance.operation_mismatch",
    );
  });

  it("preserves the fail-closed denial when the denied audit write itself fails", async () => {
    auditMocks.recordDeliveryPolicyAudit.mockRejectedValue(new Error("audit sink down"));

    await expect(
      selectDeliveryRiskPolicyPreset(baseInput({ actor: MACHINE_ACTOR })),
    ).rejects.toBeInstanceOf(DeliveryPolicyError);
  });

  it("emits only metadata-safe audit details on success", async () => {
    await selectDeliveryRiskPolicyPreset(baseInput());

    const successCall = auditMocks.recordDeliveryPolicyAudit.mock.calls.find(
      ([input]) => (input as { outcome: string }).outcome === "success",
    )?.[0] as { details: Record<string, unknown>; resource: { type: string; id: string } };

    expect(Object.keys(successCall.details).sort()).toEqual([
      "policyVersion",
      "preset",
      "presetVersion",
      "riskBroadening",
    ]);
    for (const value of Object.values(successCall.details)) {
      expect(["string", "number", "boolean"]).toContain(typeof value);
    }
    expect(successCall.resource).toEqual({ type: "delivery_risk_policy", id: POLICY_ID });
  });
});
