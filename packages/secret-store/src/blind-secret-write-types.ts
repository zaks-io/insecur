import type { AuditActorRef, AuditOperationRef, AuditRequestRef } from "@insecur/audit";
import type { Keyring } from "@insecur/crypto";
import type {
  EnvironmentId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretVersionId,
  VariableKey,
} from "@insecur/domain";
import type { SecretVersionLifecycleState } from "@insecur/tenant-store";
import type { SecretWriteDescriptiveVerdicts } from "@insecur/secret-store-contracts";

export interface BlindSecretWriteInput {
  keyring: Keyring;
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  variableKey: VariableKey;
  actor: AuditActorRef;
  secretId?: SecretId;
  valueUtf8: Uint8Array;
  allowEmpty?: boolean;
  createOnly?: boolean;
  /**
   * Version-conditional write guard (INS-609): reject with `import.existing_secret` when the
   * Secret already holds a Current Version at write time. Unlike `createOnly` (shape-level, import
   * semantics), this completes a half-created Secret Shape and is enforced atomically inside the
   * append transaction, so a value written concurrently between a caller's presence check and this
   * write can never be silently superseded. Live (non-protected) writes only.
   */
  ifCurrentVersionAbsent?: boolean;
  generationHint?: string | null;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
}

export interface BlindSecretWriteResult {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  variableKey: VariableKey;
  lifecycleState: SecretVersionLifecycleState;
  createdSecretShape: boolean;
  descriptiveVerdicts: SecretWriteDescriptiveVerdicts;
  auditEventId?: string;
}

export type ValidatedBlindWriteInput = BlindSecretWriteInput & { variableKey: VariableKey };

export type BlindSecretWriteMode = "non_protected_live" | "protected_draft";
