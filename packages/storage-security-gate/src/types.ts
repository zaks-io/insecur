import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";

import type { StorageGateDeliveryErrorCode } from "./error-codes.js";
import type { StorageSecurityGateControlId } from "./control-ids.js";

export const STORAGE_SECURITY_GATE_SCHEMA_VERSION = "1" as const;

export type StorageGateVerdictStatus = "passed" | "blocked" | "unknown";

export type StorageGateControlStatus = "passed" | "blocked" | "unknown";

export type StorageGateEvidenceKind =
  | "migration_version"
  | "key_version_id"
  | "operation_id"
  | "audit_id"
  | "configuration_version"
  | "test_run_id"
  | "key_row_id";

/** Metadata-only evidence pointer; never carries Sensitive Values or key material. */
export interface StorageGateEvidenceRef {
  readonly kind: StorageGateEvidenceKind;
  readonly id: string;
}

export interface StorageSecurityGateScope {
  readonly instanceId?: string;
  readonly organizationId?: OrganizationId;
  readonly projectId?: ProjectId;
  readonly environmentId?: EnvironmentId;
}

export interface StorageGateControl {
  readonly id: StorageSecurityGateControlId;
  readonly status: StorageGateControlStatus;
  readonly summary: string;
  readonly evidence: readonly StorageGateEvidenceRef[];
  readonly checked_at: string;
  readonly blocking_reason?: string;
}

export interface StorageSecurityGateVerdict {
  readonly schema_version: typeof STORAGE_SECURITY_GATE_SCHEMA_VERSION;
  readonly status: StorageGateVerdictStatus;
  readonly scope: StorageSecurityGateScope;
  readonly controls: readonly StorageGateControl[];
  readonly evidence: readonly StorageGateEvidenceRef[];
  readonly checked_at: string;
  readonly delivery_blocking: boolean;
  readonly error?: StorageGateDeliveryErrorCode;
}

export type StorageGateProbeOutcome =
  | {
      readonly status: "passed";
      readonly summary: string;
      readonly evidence?: readonly StorageGateEvidenceRef[];
    }
  | {
      readonly status: "blocked";
      readonly summary: string;
      readonly evidence?: readonly StorageGateEvidenceRef[];
      readonly blocking_reason: string;
    }
  | {
      readonly status: "unknown";
      readonly summary: string;
      readonly evidence?: readonly StorageGateEvidenceRef[];
      readonly blocking_reason?: string;
    };

export interface StorageSecurityGateReadinessProbes {
  checkRootKey(scope: StorageSecurityGateScope): Promise<StorageGateProbeOutcome>;
  checkRootKeyResidentSurface(scope: StorageSecurityGateScope): Promise<StorageGateProbeOutcome>;
  checkRootKeyEscrow(scope: StorageSecurityGateScope): Promise<StorageGateProbeOutcome>;
  checkTenantDataKeys(scope: StorageSecurityGateScope): Promise<StorageGateProbeOutcome>;
  checkKeyVersions(scope: StorageSecurityGateScope): Promise<StorageGateProbeOutcome>;
  checkKeyring(scope: StorageSecurityGateScope): Promise<StorageGateProbeOutcome>;
  checkTenantStore(scope: StorageSecurityGateScope): Promise<StorageGateProbeOutcome>;
  checkSecretEncryption(scope: StorageSecurityGateScope): Promise<StorageGateProbeOutcome>;
  checkKeyVersionBinding(scope: StorageSecurityGateScope): Promise<StorageGateProbeOutcome>;
  checkProviderCredentialEncryption(
    scope: StorageSecurityGateScope,
  ): Promise<StorageGateProbeOutcome>;
  checkSensitiveMetadataEncryption(
    scope: StorageSecurityGateScope,
  ): Promise<StorageGateProbeOutcome>;
  checkNoPlaintextPersistence(scope: StorageSecurityGateScope): Promise<StorageGateProbeOutcome>;
  checkDeliveryFailClosed(scope: StorageSecurityGateScope): Promise<StorageGateProbeOutcome>;
}

export interface EvaluateStorageSecurityGateInput {
  readonly scope: StorageSecurityGateScope;
  readonly probes: StorageSecurityGateReadinessProbes;
  readonly checkedAt?: string;
}
