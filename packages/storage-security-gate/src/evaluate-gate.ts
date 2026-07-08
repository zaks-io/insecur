import { STORAGE_SECURITY_GATE_CONTROL_IDS } from "./control-ids.js";
import { evaluateStorageGateControl, missingEvidenceProbeOutcome } from "./evaluate-control.js";
import { composeStorageSecurityGateVerdict } from "./derive-verdict.js";
import type {
  EvaluateStorageSecurityGateInput,
  StorageGateProbeOutcome,
  StorageSecurityGateReadinessProbes,
  StorageSecurityGateScope,
  StorageSecurityGateVerdict,
} from "./types.js";
import type { StorageSecurityGateControlId } from "./control-ids.js";

export function createMissingEvidenceProbes(): StorageSecurityGateReadinessProbes {
  const missing = (controlId: StorageSecurityGateControlId): Promise<StorageGateProbeOutcome> =>
    Promise.resolve(missingEvidenceProbeOutcome(controlId));

  return {
    checkRootKey: () => missing("storage.root_key"),
    checkRootKeyEscrow: () => missing("storage.root_key_escrow"),
    checkTenantDataKeys: () => missing("storage.tenant_data_keys"),
    checkKeyVersions: () => missing("storage.key_versions"),
    checkKeyring: () => missing("storage.keyring"),
    checkTenantStore: () => missing("storage.tenant_store"),
    checkSecretEncryption: () => missing("storage.secret_encryption"),
    checkProviderCredentialEncryption: () => missing("storage.provider_credential_encryption"),
    checkSensitiveMetadataEncryption: () => missing("storage.sensitive_metadata_encryption"),
    checkNoPlaintextPersistence: () => missing("storage.no_plaintext_persistence"),
    checkDeliveryFailClosed: () => missing("storage.delivery_fail_closed"),
  };
}

export function createStorageSecurityGateReadinessProbes(
  partial: Partial<StorageSecurityGateReadinessProbes>,
): StorageSecurityGateReadinessProbes {
  const defaults = createMissingEvidenceProbes();
  return {
    ...defaults,
    ...partial,
  };
}

const PROBE_DISPATCH: Readonly<
  Record<
    StorageSecurityGateControlId,
    (
      probes: StorageSecurityGateReadinessProbes,
      scope: StorageSecurityGateScope,
    ) => Promise<StorageGateProbeOutcome>
  >
> = {
  "storage.root_key": (probes, scope) => probes.checkRootKey(scope),
  "storage.root_key_escrow": (probes, scope) => probes.checkRootKeyEscrow(scope),
  "storage.tenant_data_keys": (probes, scope) => probes.checkTenantDataKeys(scope),
  "storage.key_versions": (probes, scope) => probes.checkKeyVersions(scope),
  "storage.keyring": (probes, scope) => probes.checkKeyring(scope),
  "storage.tenant_store": (probes, scope) => probes.checkTenantStore(scope),
  "storage.secret_encryption": (probes, scope) => probes.checkSecretEncryption(scope),
  "storage.provider_credential_encryption": (probes, scope) =>
    probes.checkProviderCredentialEncryption(scope),
  "storage.sensitive_metadata_encryption": (probes, scope) =>
    probes.checkSensitiveMetadataEncryption(scope),
  "storage.no_plaintext_persistence": (probes, scope) => probes.checkNoPlaintextPersistence(scope),
  "storage.delivery_fail_closed": (probes, scope) => probes.checkDeliveryFailClosed(scope),
};

function runProbe(
  probes: StorageSecurityGateReadinessProbes,
  controlId: StorageSecurityGateControlId,
  scope: StorageSecurityGateScope,
): Promise<StorageGateProbeOutcome> {
  return PROBE_DISPATCH[controlId](probes, scope);
}

/** Metadata-only readiness verdict for production delivery; never returns Sensitive Values. */
export async function evaluateStorageSecurityGate(
  input: EvaluateStorageSecurityGateInput,
): Promise<StorageSecurityGateVerdict> {
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const controls = await Promise.all(
    STORAGE_SECURITY_GATE_CONTROL_IDS.map(async (controlId) => {
      const outcome = await runProbe(input.probes, controlId, input.scope);
      return evaluateStorageGateControl(controlId, outcome, checkedAt);
    }),
  );

  return composeStorageSecurityGateVerdict({
    scope: input.scope,
    controls,
    checkedAt,
  });
}
