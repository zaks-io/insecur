import { assertMetadataSafe } from "@insecur/domain";
import type { OrganizationId, ProjectId } from "@insecur/domain";

import {
  assertProductionDeliveryGatePassed,
  createMissingEvidenceProbes,
  createStorageSecurityGateReadinessProbes,
  evaluateStorageSecurityGate,
  FIRST_VALUE_LOCAL_RUNTIME_INJECTION_PATH,
  isStorageGateDeliveryError,
  PRODUCTION_DELIVERY_PATHS,
  requiresProductionStorageSecurityGate,
  runWithProductionDeliveryGate,
  STORAGE_GATE_ERROR_CODES,
  STORAGE_SECURITY_GATE_CONTROL_IDS,
  StorageGateDeliveryError,
} from "./index.js";
import type { StorageGateProbeOutcome, StorageSecurityGateReadinessProbes } from "./types.js";

export {
  assertMetadataSafe,
  assertProductionDeliveryGatePassed,
  FIRST_VALUE_LOCAL_RUNTIME_INJECTION_PATH,
  isStorageGateDeliveryError,
  PRODUCTION_DELIVERY_PATHS,
  requiresProductionStorageSecurityGate,
  runWithProductionDeliveryGate,
  STORAGE_GATE_ERROR_CODES,
  StorageGateDeliveryError,
};

const CHECKED_AT = "2026-07-08T00:00:00.000Z";

function passedProbe(summary: string, evidenceId: string): StorageGateProbeOutcome {
  return {
    status: "passed",
    summary,
    evidence: [{ kind: "key_version_id", id: evidenceId }],
  };
}

function probeNameForControl(
  controlId: (typeof STORAGE_SECURITY_GATE_CONTROL_IDS)[number],
): keyof StorageSecurityGateReadinessProbes {
  const mapping = {
    "storage.root_key": "checkRootKey",
    "storage.root_key_resident_surface": "checkRootKeyResidentSurface",
    "storage.root_key_escrow": "checkRootKeyEscrow",
    "storage.tenant_data_keys": "checkTenantDataKeys",
    "storage.key_versions": "checkKeyVersions",
    "storage.keyring": "checkKeyring",
    "storage.tenant_store": "checkTenantStore",
    "storage.secret_encryption": "checkSecretEncryption",
    "storage.key_version_binding": "checkKeyVersionBinding",
    "storage.provider_credential_encryption": "checkProviderCredentialEncryption",
    "storage.sensitive_metadata_encryption": "checkSensitiveMetadataEncryption",
    "storage.no_plaintext_persistence": "checkNoPlaintextPersistence",
    "storage.delivery_fail_closed": "checkDeliveryFailClosed",
  } as const;
  return mapping[controlId];
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

export async function createAllPassedGateVerdict(scope: {
  organizationId: OrganizationId;
  projectId: ProjectId;
}) {
  return evaluateStorageSecurityGate({
    scope,
    probes: createAllPassedProbes(),
    checkedAt: CHECKED_AT,
  });
}

export async function createBlockedGateVerdict(scope: {
  organizationId: OrganizationId;
  projectId: ProjectId;
}) {
  const probes = createAllPassedProbes();
  probes.checkTenantStore = () =>
    Promise.resolve({
      status: "blocked",
      summary: "Tenant-Scoped Store RLS policies are inactive.",
      blocking_reason: "rls_policy_missing",
      evidence: [{ kind: "migration_version", id: "20260601000000" }],
    });

  return evaluateStorageSecurityGate({
    scope,
    probes,
    checkedAt: CHECKED_AT,
  });
}

export async function createUnknownGateVerdict(scope: {
  organizationId: OrganizationId;
  projectId: ProjectId;
}) {
  return evaluateStorageSecurityGate({
    scope,
    probes: createMissingEvidenceProbes(),
    checkedAt: CHECKED_AT,
  });
}
