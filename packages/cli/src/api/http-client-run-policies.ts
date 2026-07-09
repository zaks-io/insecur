import { authorizedJsonRequest } from "./http-client-metadata.js";
import type { HttpClientOptions } from "./http-client-envelope.js";
import type { ApiClient } from "./types.js";
import type {
  CreateRuntimeInjectionPolicyData,
  DisableRuntimeInjectionPolicyData,
  RuntimeInjectionPolicyShowData,
} from "./run-policies-api-types.js";

export async function createRuntimeInjectionPolicy(
  base: string,
  input: Parameters<ApiClient["createRuntimeInjectionPolicy"]>[0],
  options?: HttpClientOptions,
) {
  const body: Record<string, unknown> = {
    projectId: input.projectId,
    environmentId: input.environmentId,
    policyId: input.policyId,
    displayName: input.displayName,
    command: input.command,
    secretIds: input.secretIds,
  };
  if (input.commandFingerprint !== undefined) {
    body.commandFingerprint = input.commandFingerprint;
  }
  if (input.operationId !== undefined) {
    body.operationId = input.operationId;
  }
  return authorizedJsonRequest<CreateRuntimeInjectionPolicyData>(
    base,
    `/v1/orgs/${input.organizationId}/run-policies`,
    input.bearerCredential,
    { method: "POST", body, options },
  );
}

export async function getRuntimeInjectionPolicy(
  base: string,
  input: Parameters<ApiClient["getRuntimeInjectionPolicy"]>[0],
  options?: HttpClientOptions,
) {
  return authorizedJsonRequest<RuntimeInjectionPolicyShowData>(
    base,
    `/v1/orgs/${input.organizationId}/run-policies/${input.policyId}`,
    input.bearerCredential,
    { method: "GET", options },
  );
}

export async function disableRuntimeInjectionPolicy(
  base: string,
  input: Parameters<ApiClient["disableRuntimeInjectionPolicy"]>[0],
  options?: HttpClientOptions,
) {
  const body: Record<string, unknown> = {
    projectId: input.projectId,
    environmentId: input.environmentId,
    comment: input.comment,
  };
  if (input.operationId !== undefined) {
    body.operationId = input.operationId;
  }
  return authorizedJsonRequest<DisableRuntimeInjectionPolicyData>(
    base,
    `/v1/orgs/${input.organizationId}/run-policies/${input.policyId}/disable`,
    input.bearerCredential,
    { method: "POST", body, options },
  );
}
