import type {
  EnvironmentId,
  InjectionGrantId,
  ProjectId,
  SecretId,
  SecretVersionId,
  VariableKey,
} from "@insecur/domain";
import type { SecretWriteDescriptiveVerdicts } from "@insecur/secret-store-contracts";

/** Wrapped material accepted by the local Secret Version Store (plaintext-free). */
export interface LocalStoredWrappedSecretMaterial {
  readonly organizationDataKeyVersion: number;
  readonly projectDataKeyVersion: number;
  readonly ciphertext: Uint8Array;
}

export interface LocalSecretVersionRow {
  readonly secretVersionId: SecretVersionId;
  readonly secretId: SecretId;
  readonly wrapped: LocalStoredWrappedSecretMaterial;
}

export interface LocalSecretShapeRow {
  readonly projectId: ProjectId;
  readonly variableKey: VariableKey;
  readonly secretId: SecretId;
  readonly displayName: string | null;
  readonly description: string | null;
  readonly required: boolean;
  readonly generationHint: string | null;
}

export interface LocalProjectRow {
  readonly projectId: ProjectId;
  readonly displayName: string | null;
}

export interface LocalEnvironmentRow {
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly displayName: string | null;
}

export interface LocalSecretMetadataRow {
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretId: SecretId;
  readonly variableKey: VariableKey;
  readonly hasCurrentVersion: boolean;
  readonly descriptiveVerdicts?: SecretWriteDescriptiveVerdicts;
}

export interface LocalResolvedInjectionGrantBinding {
  readonly secretId: SecretId;
  readonly secretVersionId: SecretVersionId;
  readonly variableKey: VariableKey;
}

export interface LocalInsertInjectionGrantInput {
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly grantId: InjectionGrantId;
  readonly bindings: readonly LocalResolvedInjectionGrantBinding[];
  readonly expiresAt: Date;
}

export type LocalInjectionGrantConsumeFailure =
  "not_found" | "expired" | "already_consumed" | "binding_not_allowed";

export interface LocalConsumedInjectionGrantRow {
  readonly grantId: InjectionGrantId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretId: SecretId;
  readonly secretVersionId: SecretVersionId;
  readonly variableKey: VariableKey;
}

export interface LocalAuditEventInput {
  readonly eventCode: string;
  readonly outcome: "success" | "denied";
  readonly projectId?: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly secretId?: SecretId;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface LocalAuditEventRow {
  readonly auditEventId: string;
  readonly eventCode: string;
  readonly outcome: "success" | "denied";
  readonly projectId: ProjectId | null;
  readonly environmentId: EnvironmentId | null;
  readonly secretId: SecretId | null;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
  readonly createdAt: string;
}

export interface LocalReplaceCurrentVersionInput {
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretId: SecretId;
  readonly secretVersionId: SecretVersionId;
  readonly variableKey: VariableKey;
  readonly wrapped: LocalStoredWrappedSecretMaterial;
  readonly descriptiveVerdicts: SecretWriteDescriptiveVerdicts;
}

export interface LocalUpsertSecretShapeInput {
  readonly projectId: ProjectId;
  readonly variableKey: VariableKey;
  readonly secretId: SecretId;
  readonly displayName?: string | null;
  readonly description?: string | null;
  readonly required?: boolean;
  readonly generationHint?: string | null;
}
