import type {
  EnvironmentId,
  KnownErrorCode,
  OrganizationId,
  ProjectId,
  VariableKey,
} from "@insecur/domain";

export interface ImportPreflightIssue {
  readonly lineNumber?: number;
  readonly variableKey?: VariableKey;
  readonly code: KnownErrorCode;
}

export interface ImportPreflightWritePlan {
  readonly variableKey: VariableKey;
  readonly lineNumber: number;
  readonly createSecretShape: boolean;
  readonly createSecret: boolean;
  readonly valueUtf8: Uint8Array;
}

export interface SecretImportPlan {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly parsedKeyCount: number;
  readonly validFinalVariableKeys: readonly VariableKey[];
  readonly secretShapesToCreate: readonly VariableKey[];
  readonly secretsToCreate: readonly VariableKey[];
  readonly duplicateVariableKeys: readonly VariableKey[];
  readonly existingSecretConflicts: readonly VariableKey[];
  readonly issues: readonly ImportPreflightIssue[];
  readonly writes: readonly ImportPreflightWritePlan[];
  readonly ready: boolean;
}
