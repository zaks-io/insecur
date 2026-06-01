import type {
  EnvironmentId,
  InjectionGrantId,
  OrganizationId,
  ProjectId,
  VariableKey,
} from "@insecur/domain";

export interface InsertInjectionGrantInput {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  grantId: InjectionGrantId;
  variableKeys: readonly VariableKey[];
  expiresAt: Date;
}

export interface InjectionGrantRow {
  id: string;
  org_id: string;
  project_id: string;
  environment_id: string;
  variable_keys: string[];
  expires_at: Date;
  consumed_at: Date | null;
}
