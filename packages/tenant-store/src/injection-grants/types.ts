import type {
  EnvironmentId,
  InjectionGrantId,
  OrganizationId,
  ProjectId,
  SecretId,
  VariableKey,
} from "@insecur/domain";

export interface ResolvedInjectionGrantBinding {
  secretId: SecretId;
  variableKey: VariableKey;
}

export interface InsertInjectionGrantInput {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  grantId: InjectionGrantId;
  bindings: readonly ResolvedInjectionGrantBinding[];
  expiresAt: Date;
}

export interface InjectionGrantRow {
  id: string;
  org_id: string;
  project_id: string;
  environment_id: string;
  variable_keys: string[];
  secret_ids: string[];
  expires_at: Date;
  consumed_at: Date | null;
}
