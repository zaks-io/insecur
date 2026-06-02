import type {
  EnvironmentId,
  OrganizationId,
  ProjectId,
  SecretId,
  VariableKey,
} from "@insecur/domain";

/** Read-path coordinate for resolving an exact Secret inside one Environment. */
export interface ResolveSecretForReadInput {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  variableKey?: VariableKey;
  secretId?: SecretId;
}

export interface ResolvedSecretForRead {
  secretId: SecretId;
  variableKey: VariableKey;
}
