import type {
  EnvironmentId,
  InjectionGrantId,
  OrganizationId,
  ProjectId,
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
  binding: ResolvedInjectionGrantBinding;
  expiresAt: Date;
}

export interface InjectionGrantRow {
  id: string;
  org_id: string;
  project_id: string;
  environment_id: string;
  variable_keys: string[];
  secret_ids: string[];
  secret_version_id: string | null;
  expires_at: Date;
  consumed_at: Date | null;
}
