import type {
  EnvironmentId,
  InjectionGrantId,
  MachineIdentityId,
  OrganizationId,
  ProjectId,
  RuntimePolicyId,
  RuntimePolicyVersionId,
  SecretId,
  SecretVersionId,
  VariableKey,
  UserId,
} from "@insecur/domain";

export type InjectionGrantIssuedTo =
  | { readonly type: "user"; readonly userId: UserId }
  | {
      readonly type: "machine";
      readonly machineIdentityId: MachineIdentityId;
      readonly runtimePolicyKeyId?: RuntimePolicyId;
    };

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
  issuedTo: InjectionGrantIssuedTo;
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
  issued_actor_type: string;
  issued_user_id: string | null;
  issued_machine_identity_id: string | null;
  issued_runtime_policy_key_id: string | null;
  expires_at: Date;
  consumed_at: Date | null;
  revoked_at: Date | null;
  revoked_reason: string | null;
}

export const INJECTION_GRANT_REVOCATION_REASONS = {
  tenantSuspension: "tenant_suspension",
  compromiseVersionInvalidation: "compromise_version_invalidation",
} as const;

export type InjectionGrantRevocationReason =
  (typeof INJECTION_GRANT_REVOCATION_REASONS)[keyof typeof INJECTION_GRANT_REVOCATION_REASONS];

export type InjectionGrantConsumeFailure =
  | "not_found"
  | "expired"
  | "already_consumed"
  | "binding_not_allowed"
  | "consume_mode_mismatch"
  | "revoked";

export interface ConsumedInjectionGrantRow {
  grantId: InjectionGrantId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  variableKey: VariableKey;
}
