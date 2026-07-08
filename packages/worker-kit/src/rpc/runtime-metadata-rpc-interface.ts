import type {
  CreateEnvironmentRpcInput,
  CreateEnvironmentRpcPayload,
  CreateProjectRpcInput,
  CreateProjectRpcPayload,
  ListEnvironmentsRpcInput,
  ListEnvironmentsRpcPayload,
  ListEnvironmentSecretsRpcInput,
  ListEnvironmentSecretsRpcPayload,
  ListProjectSecretsRpcInput,
  ListProjectSecretsRpcPayload,
  ListProjectsRpcInput,
  ListProjectsRpcPayload,
  ListSecretVersionsRpcInput,
  ListSecretVersionsRpcPayload,
} from "./runtime-metadata-rpc-contract.js";
import type { RuntimeRpcResult } from "./runtime-rpc-contract.js";

export interface RuntimeMetadataRpc {
  listProjects(input: ListProjectsRpcInput): Promise<RuntimeRpcResult<ListProjectsRpcPayload>>;
  createProject(input: CreateProjectRpcInput): Promise<RuntimeRpcResult<CreateProjectRpcPayload>>;
  listEnvironments(
    input: ListEnvironmentsRpcInput,
  ): Promise<RuntimeRpcResult<ListEnvironmentsRpcPayload>>;
  createEnvironment(
    input: CreateEnvironmentRpcInput,
  ): Promise<RuntimeRpcResult<CreateEnvironmentRpcPayload>>;
  listProjectSecrets(
    input: ListProjectSecretsRpcInput,
  ): Promise<RuntimeRpcResult<ListProjectSecretsRpcPayload>>;
  listEnvironmentSecrets(
    input: ListEnvironmentSecretsRpcInput,
  ): Promise<RuntimeRpcResult<ListEnvironmentSecretsRpcPayload>>;
  listSecretVersions(
    input: ListSecretVersionsRpcInput,
  ): Promise<RuntimeRpcResult<ListSecretVersionsRpcPayload>>;
}
