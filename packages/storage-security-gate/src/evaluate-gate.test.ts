import { describe, expect, it } from "vitest";

import type { OrganizationId, ProjectId } from "@insecur/domain";

import {
  assertStorageGateVerdictIsMetadataSafe,
  createMissingEvidenceProbes,
  createStorageSecurityGateReadinessProbes,
  evaluateStorageSecurityGate,
  STORAGE_SECURITY_GATE_CONTROL_IDS,
  STORAGE_SECURITY_GATE_SCHEMA_VERSION,
  storageGateVerdictContainsSensitiveMaterial,
} from "./index.js";
import type { StorageGateProbeOutcome, StorageSecurityGateReadinessProbes } from "./types.js";

const SCOPE = {
  organizationId: "org_01RCAN00000000000000000001" as OrganizationId,
  projectId: "prj_01RCAN00000000000000000002" as ProjectId,
} as const;

const CHECKED_AT = "2026-07-08T00:00:00.000Z";

function passedProbe(summary: string, evidenceId: string): StorageGateProbeOutcome {
  return {
    status: "passed",
    summary,
    evidence: [{ kind: "key_version_id", id: evidenceId }],
  };
}

function createAllPassedProbes(): StorageSecurityGateReadinessProbes {
  const partial: Partial<StorageSecurityGateReadinessProbes> = {};
  for (const [index, controlId] of STORAGE_SECURITY_GATE_CONTROL_IDS.entries()) {
    const probeName = probeNameForControl(controlId);
    partial[probeName] = () =>
      Promise.resolve(passedProbe(`${controlId} ready`, `kv_${String(index)}`));
  }
  return createStorageSecurityGateReadinessProbes(partial);
}

function probeNameForControl(
  controlId: (typeof STORAGE_SECURITY_GATE_CONTROL_IDS)[number],
): keyof StorageSecurityGateReadinessProbes {
  const mapping = {
    "storage.root_key": "checkRootKey",
    "storage.root_key_escrow": "checkRootKeyEscrow",
    "storage.tenant_data_keys": "checkTenantDataKeys",
    "storage.key_versions": "checkKeyVersions",
    "storage.keyring": "checkKeyring",
    "storage.tenant_store": "checkTenantStore",
    "storage.secret_encryption": "checkSecretEncryption",
    "storage.provider_credential_encryption": "checkProviderCredentialEncryption",
    "storage.sensitive_metadata_encryption": "checkSensitiveMetadataEncryption",
    "storage.no_plaintext_persistence": "checkNoPlaintextPersistence",
    "storage.delivery_fail_closed": "checkDeliveryFailClosed",
  } as const;
  return mapping[controlId];
}

describe("evaluateStorageSecurityGate", () => {
  it("returns the documented verdict shape with stable control ids", async () => {
    const verdict = await evaluateStorageSecurityGate({
      scope: SCOPE,
      probes: createAllPassedProbes(),
      checkedAt: CHECKED_AT,
    });

    expect(verdict.schema_version).toBe(STORAGE_SECURITY_GATE_SCHEMA_VERSION);
    expect(verdict.checked_at).toBe(CHECKED_AT);
    expect(verdict.scope).toEqual(SCOPE);
    expect(verdict.controls.map((entry) => entry.id)).toEqual([
      ...STORAGE_SECURITY_GATE_CONTROL_IDS,
    ]);
    expect(verdict.status).toBe("passed");
    expect(verdict.delivery_blocking).toBe(false);
    expect(verdict.error).toBeUndefined();
    expect(verdict.evidence.length).toBeGreaterThan(0);
    assertStorageGateVerdictIsMetadataSafe(verdict);
  });

  it("passes when every probe reports readiness", async () => {
    const verdict = await evaluateStorageSecurityGate({
      scope: SCOPE,
      probes: createAllPassedProbes(),
      checkedAt: CHECKED_AT,
    });

    expect(verdict.controls.every((control) => control.status === "passed")).toBe(true);
  });

  it("blocks delivery when a probe reports blocked readiness", async () => {
    const probes = createAllPassedProbes();
    probes.checkTenantStore = () =>
      Promise.resolve({
        status: "blocked",
        summary: "Tenant-Scoped Store RLS policies are inactive.",
        blocking_reason: "rls_policy_missing",
        evidence: [{ kind: "migration_version", id: "20260601000000" }],
      });

    const verdict = await evaluateStorageSecurityGate({
      scope: SCOPE,
      probes,
      checkedAt: CHECKED_AT,
    });

    const tenantStore = verdict.controls.find((control) => control.id === "storage.tenant_store");
    expect(verdict.status).toBe("blocked");
    expect(verdict.delivery_blocking).toBe(true);
    expect(verdict.error).toBe("storage.gate_blocked");
    expect(tenantStore?.status).toBe("blocked");
    expect(tenantStore?.blocking_reason).toBe("rls_policy_missing");
    assertStorageGateVerdictIsMetadataSafe(verdict);
  });

  it("blocks delivery when readiness evidence is unknown", async () => {
    const probes = createAllPassedProbes();
    probes.checkKeyring = () =>
      Promise.resolve({
        status: "unknown",
        summary: "Keyring readiness probe could not reach metadata store.",
        blocking_reason: "dependency_unreachable",
        evidence: [{ kind: "operation_id", id: "op_01RCAN00000000000000000005" }],
      });

    const verdict = await evaluateStorageSecurityGate({
      scope: SCOPE,
      probes,
      checkedAt: CHECKED_AT,
    });

    const keyring = verdict.controls.find((control) => control.id === "storage.keyring");
    expect(verdict.status).toBe("unknown");
    expect(verdict.delivery_blocking).toBe(true);
    expect(verdict.error).toBe("storage.gate_unknown");
    expect(keyring?.status).toBe("unknown");
    assertStorageGateVerdictIsMetadataSafe(verdict);
  });

  it("marks missing probes as unknown with stable blocking reasons", async () => {
    const verdict = await evaluateStorageSecurityGate({
      scope: SCOPE,
      probes: createMissingEvidenceProbes(),
      checkedAt: CHECKED_AT,
    });

    expect(verdict.status).toBe("unknown");
    expect(verdict.delivery_blocking).toBe(true);
    expect(verdict.controls.every((control) => control.status === "unknown")).toBe(true);
    expect(verdict.controls[0]?.blocking_reason).toBe("missing_readiness_evidence");
  });

  it("aggregates metadata-only evidence references without duplicates", async () => {
    const sharedEvidence = [{ kind: "audit_id" as const, id: "aud_01RCAN00000000000000000006" }];
    const probes = createStorageSecurityGateReadinessProbes({
      checkRootKey: () =>
        Promise.resolve({
          status: "passed",
          summary: "Root key ready.",
          evidence: sharedEvidence,
        }),
      checkKeyring: () =>
        Promise.resolve({
          status: "passed",
          summary: "Keyring ready.",
          evidence: sharedEvidence,
        }),
    });

    const verdict = await evaluateStorageSecurityGate({
      scope: SCOPE,
      probes,
      checkedAt: CHECKED_AT,
    });

    const auditRefs = verdict.evidence.filter((ref) => ref.kind === "audit_id");
    expect(auditRefs).toEqual([{ kind: "audit_id", id: "aud_01RCAN00000000000000000006" }]);
  });
});

describe("no-reveal gate output", () => {
  it("rejects verdicts that contain sensitive-looking strings", async () => {
    const verdict = await evaluateStorageSecurityGate({
      scope: SCOPE,
      probes: createAllPassedProbes(),
      checkedAt: CHECKED_AT,
    });

    const firstControl = verdict.controls[0];
    if (!firstControl) {
      throw new Error("expected at least one control");
    }

    const leaked = {
      ...verdict,
      controls: [
        {
          ...firstControl,
          summary: `leaked ${["gh", "p_", "x".repeat(36)].join("")}`,
        },
        ...verdict.controls.slice(1),
      ],
    };

    expect(storageGateVerdictContainsSensitiveMaterial(leaked)).toBe(true);
    expect(() => {
      assertStorageGateVerdictIsMetadataSafe(leaked);
    }).toThrow(/metadata-safe/);
  });

  it("serializes verdicts without forbidden reveal keys", async () => {
    const verdict = await evaluateStorageSecurityGate({
      scope: SCOPE,
      probes: createAllPassedProbes(),
      checkedAt: CHECKED_AT,
    });

    const serialized = JSON.stringify(verdict);
    expect(serialized).not.toMatch(/"secret"/i);
    expect(serialized).not.toMatch(/"password"/i);
    expect(serialized).not.toMatch(/ghp_/);
  });
});
