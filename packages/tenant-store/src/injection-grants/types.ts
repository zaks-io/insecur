import type {
  EnvironmentId,
  InjectionGrantId,
  OrganizationId,
  ProjectId,
  RuntimePolicyId,
  RuntimePolicyVersionId,
  SecretId,
  SecretVersionId,
  VariableKey,
} from "@insecur/domain";

/** One exact Secret + Secret Version bound at grant issue (metadata only). */
export interface ResolvedInjectionGrantBinding {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  variableKey: VariableKey;
}

export interface InsertInjectionGrantInput {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  grantId: InjectionGrantId;
  bindings: readonly ResolvedInjectionGrantBinding[];
  expiresAt: Date;
  policyId?: RuntimePolicyId;
  policyVersionId?: RuntimePolicyVersionId;
}

export interface InjectionGrantRow {
  id: string;
  org_id: string;
  project_id: string;
  environment_id: string;
  variable_keys: string[];
  secret_ids: string[];
  secret_version_ids: string[];
  policy_id: string | null;
  policy_version_id: string | null;
  expires_at: Date;
  consumed_at: Date | null;
}

export type InjectionGrantConsumeFailure =
  "not_found" | "expired" | "already_consumed" | "binding_not_allowed" | "consume_mode_mismatch";

export interface ConsumedInjectionGrantRow {
  grantId: InjectionGrantId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  variableKey: VariableKey;
}
