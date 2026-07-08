import {
  createStorageSecurityGateReadinessProbes,
  evaluateStorageSecurityGate,
  STORAGE_SECURITY_GATE_CONTROL_IDS,
  type StorageGateProbeOutcome,
  type StorageSecurityGateReadinessProbes,
  type StorageSecurityGateScope,
  type StorageSecurityGateVerdict,
} from "@insecur/storage-security-gate";

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

function passedProbe(summary: string, evidenceId: string): StorageGateProbeOutcome {
  return {
    status: "passed",
    summary,
    evidence: [{ kind: "test_run_id", id: evidenceId }],
  };
}

function createAllPassedProbes(): StorageSecurityGateReadinessProbes {
  const partial: Partial<StorageSecurityGateReadinessProbes> = {};
  for (const [index, controlId] of STORAGE_SECURITY_GATE_CONTROL_IDS.entries()) {
    const probeName = probeNameForControl(controlId);
    partial[probeName] = () =>
      Promise.resolve(passedProbe(`${controlId} ready`, `gate_${String(index)}`));
  }
  return createStorageSecurityGateReadinessProbes(partial);
}

export function createPassedProductionGateEvaluator(): (
  scope: StorageSecurityGateScope,
) => Promise<StorageSecurityGateVerdict> {
  return (scope) =>
    evaluateStorageSecurityGate({
      scope,
      probes: createAllPassedProbes(),
    });
}

export function createBlockedProductionGateEvaluator(): (
  scope: StorageSecurityGateScope,
) => Promise<StorageSecurityGateVerdict> {
  const probes = createAllPassedProbes();
  probes.checkTenantStore = () =>
    Promise.resolve({
      status: "blocked",
      summary: "Tenant-Scoped Store RLS policies are inactive.",
      blocking_reason: "rls_policy_missing",
      evidence: [{ kind: "migration_version", id: "20260601000000" }],
    });

  return (scope) =>
    evaluateStorageSecurityGate({
      scope,
      probes,
    });
}
