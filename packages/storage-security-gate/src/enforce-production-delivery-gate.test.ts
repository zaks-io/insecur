import { describe, expect, it, vi } from "vitest";

import type { OrganizationId, ProjectId } from "@insecur/domain";

import {
  assertMetadataSafe,
  assertProductionDeliveryGatePassed,
  createAllPassedGateVerdict,
  createBlockedGateVerdict,
  createUnknownGateVerdict,
  FIRST_VALUE_LOCAL_RUNTIME_INJECTION_PATH,
  isStorageGateDeliveryError,
  PRODUCTION_DELIVERY_PATHS,
  requiresProductionStorageSecurityGate,
  runWithProductionDeliveryGate,
  STORAGE_GATE_ERROR_CODES,
  StorageGateDeliveryError,
} from "./enforce-production-delivery-gate.test-support.js";

const SCOPE = {
  organizationId: "org_01RCAN00000000000000000001" as OrganizationId,
  projectId: "prj_01RCAN00000000000000000002" as ProjectId,
} as const;

describe("requiresProductionStorageSecurityGate", () => {
  it("requires the gate for every production delivery path", () => {
    expect(requiresProductionStorageSecurityGate(PRODUCTION_DELIVERY_PATHS.secretSync)).toBe(true);
    expect(requiresProductionStorageSecurityGate(PRODUCTION_DELIVERY_PATHS.runtimeInjection)).toBe(
      true,
    );
    expect(
      requiresProductionStorageSecurityGate(PRODUCTION_DELIVERY_PATHS.providerCredentialUse),
    ).toBe(true);
  });

  it("carves out First Value local Runtime Injection", () => {
    expect(requiresProductionStorageSecurityGate(FIRST_VALUE_LOCAL_RUNTIME_INJECTION_PATH)).toBe(
      false,
    );
  });
});

describe("assertProductionDeliveryGatePassed", () => {
  it("returns undefined without evaluating the gate for First Value local Runtime Injection", async () => {
    const evaluateGate = vi.fn();

    await expect(
      assertProductionDeliveryGatePassed({
        path: FIRST_VALUE_LOCAL_RUNTIME_INJECTION_PATH,
        evaluateGate,
      }),
    ).resolves.toBeUndefined();

    expect(evaluateGate).not.toHaveBeenCalled();
  });

  it("returns the passed verdict for production delivery paths", async () => {
    const verdict = await createAllPassedGateVerdict(SCOPE);

    const result = await assertProductionDeliveryGatePassed({
      path: PRODUCTION_DELIVERY_PATHS.secretSync,
      evaluateGate: () => Promise.resolve(verdict),
    });

    expect(result).toBe(verdict);
  });

  it("throws storage.gate_blocked before delivery continues", async () => {
    const verdict = await createBlockedGateVerdict(SCOPE);

    try {
      await assertProductionDeliveryGatePassed({
        path: PRODUCTION_DELIVERY_PATHS.providerCredentialUse,
        evaluateGate: () => Promise.resolve(verdict),
      });
      throw new Error("expected gate denial");
    } catch (error) {
      expect(isStorageGateDeliveryError(error)).toBe(true);
      if (!isStorageGateDeliveryError(error)) {
        throw error;
      }
      expect(error.code).toBe(STORAGE_GATE_ERROR_CODES.gateBlocked);
      expect(error.path).toBe(PRODUCTION_DELIVERY_PATHS.providerCredentialUse);
      expect(error.denialMetadata.reasonCode).toBe(STORAGE_GATE_ERROR_CODES.gateBlocked);
      expect(error.denialMetadata.blockedControlIds).toContain("storage.tenant_store");
      assertMetadataSafe(error.denialMetadata);
    }
  });

  it("throws storage.gate_unknown for unknown readiness evidence", async () => {
    const verdict = await createUnknownGateVerdict(SCOPE);

    await expect(
      assertProductionDeliveryGatePassed({
        path: PRODUCTION_DELIVERY_PATHS.runtimeInjection,
        evaluateGate: () => Promise.resolve(verdict),
      }),
    ).rejects.toMatchObject({
      code: STORAGE_GATE_ERROR_CODES.gateUnknown,
      path: PRODUCTION_DELIVERY_PATHS.runtimeInjection,
    });
  });
});

describe("runWithProductionDeliveryGate", () => {
  it("denies blocked and unknown verdicts before decrypt or provider credential use", async () => {
    const decrypt = vi.fn(() => Promise.resolve("plaintext"));
    const useProviderCredential = vi.fn(() => Promise.resolve(undefined));
    const providerWrite = vi.fn(() => Promise.resolve(undefined));

    const deliverySteps = async () => {
      await useProviderCredential();
      await decrypt();
      await providerWrite();
      return "delivered";
    };

    for (const [label, verdict] of [
      ["blocked", await createBlockedGateVerdict(SCOPE)],
      ["unknown", await createUnknownGateVerdict(SCOPE)],
    ] as const) {
      decrypt.mockClear();
      useProviderCredential.mockClear();
      providerWrite.mockClear();

      await expect(
        runWithProductionDeliveryGate({
          path: PRODUCTION_DELIVERY_PATHS.secretSync,
          evaluateGate: () => Promise.resolve(verdict),
          delivery: deliverySteps,
        }),
      ).rejects.toBeInstanceOf(StorageGateDeliveryError);

      expect(decrypt, `${label} verdict must block before decrypt`).not.toHaveBeenCalled();
      expect(
        useProviderCredential,
        `${label} verdict must block before provider credential use`,
      ).not.toHaveBeenCalled();
      expect(
        providerWrite,
        `${label} verdict must block before provider write`,
      ).not.toHaveBeenCalled();
    }
  });

  it("allows First Value local Runtime Injection without evaluating the production gate", async () => {
    const evaluateGate = vi.fn();
    const decrypt = vi.fn(() => Promise.resolve("tenant-bound-plaintext"));

    const result = await runWithProductionDeliveryGate({
      path: FIRST_VALUE_LOCAL_RUNTIME_INJECTION_PATH,
      evaluateGate,
      delivery: (gateVerdict) => {
        expect(gateVerdict).toBeUndefined();
        return decrypt();
      },
    });

    expect(evaluateGate).not.toHaveBeenCalled();
    expect(decrypt).toHaveBeenCalledOnce();
    expect(result).toBe("tenant-bound-plaintext");
  });

  it("runs delivery only after a passed production gate verdict", async () => {
    const verdict = await createAllPassedGateVerdict(SCOPE);
    const order: string[] = [];

    const result = await runWithProductionDeliveryGate({
      path: PRODUCTION_DELIVERY_PATHS.runtimeInjection,
      evaluateGate: () => {
        order.push("gate");
        return Promise.resolve(verdict);
      },
      delivery: (gateVerdict) => {
        order.push("delivery");
        expect(gateVerdict).toBe(verdict);
        return Promise.resolve("ok");
      },
    });

    expect(order).toEqual(["gate", "delivery"]);
    expect(result).toBe("ok");
  });
});
