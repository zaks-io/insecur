import type { IssueInjectionGrantData } from "./runtime-injection-api-types.js";
import type { RuntimeInjectionApiClient } from "./runtime-injection-api-types.js";
import {
  parseDeliveryAllEnvelope,
  parseDeliveryEnvelope,
  parseEnvelope,
  postAuthorizedJson,
  type HttpClientOptions,
} from "./http-client-envelope.js";

export async function issueInjectionGrant(
  base: string,
  input: Parameters<RuntimeInjectionApiClient["issueInjectionGrant"]>[0],
  options?: HttpClientOptions,
) {
  const path = `/v1/orgs/${input.organizationId}/runtime-injection/grants`;
  const selectorBody =
    "policyId" in input ? { policyId: input.policyId } : { variableKey: input.variableKey };
  const { response, body: responseBody } = await postAuthorizedJson(
    base,
    path,
    input.bearerCredential,
    {
      body: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        ...selectorBody,
      },
      options,
    },
  );
  const envelope = parseEnvelope<IssueInjectionGrantData>(responseBody);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  return { ok: true as const, envelope };
}

export async function consumeInjectionGrant(
  base: string,
  input: Parameters<RuntimeInjectionApiClient["consumeInjectionGrant"]>[0],
  options?: HttpClientOptions,
) {
  const path = `/v1/orgs/${input.organizationId}/runtime-injection/grants/${input.grantId}/consume`;
  const { response, body: responseBody } = await postAuthorizedJson(
    base,
    path,
    input.bearerCredential,
    {
      body: {
        organizationId: input.organizationId,
        variableKey: input.variableKey,
      },
      options,
    },
  );
  const envelope = parseDeliveryEnvelope(responseBody);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  return { ok: true as const, envelope };
}

export async function consumeInjectionGrantAll(
  base: string,
  input: Parameters<RuntimeInjectionApiClient["consumeInjectionGrantAll"]>[0],
  options?: HttpClientOptions,
) {
  const path = `/v1/orgs/${input.organizationId}/runtime-injection/grants/${input.grantId}/consume-all`;
  const { response, body: responseBody } = await postAuthorizedJson(
    base,
    path,
    input.bearerCredential,
    {
      body: { organizationId: input.organizationId },
      options,
    },
  );
  const envelope = parseDeliveryAllEnvelope(responseBody);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  return { ok: true as const, envelope };
}

export async function recordInjectionRunCompleted(
  base: string,
  input: Parameters<RuntimeInjectionApiClient["recordInjectionRunCompleted"]>[0],
  options?: HttpClientOptions,
) {
  const path = `/v1/orgs/${input.organizationId}/runtime-injection/grants/${input.grantId}/run-completed`;
  const { response, body: responseBody } = await postAuthorizedJson(
    base,
    path,
    input.bearerCredential,
    {
      body: {
        organizationId: input.organizationId,
        childExitCode: input.childExitCode,
      },
      options,
    },
  );
  const envelope = parseEnvelope<{
    auditEventId: string;
    alreadyRecorded: boolean;
  }>(responseBody);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  return { ok: true as const, envelope };
}
