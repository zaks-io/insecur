import { authorizedJsonRequest } from "./http-client-metadata.js";
import type { ApiClient } from "./types.js";
import type {
  ListEnvironmentApprovalsData,
  RequestProtectedPromotionData,
  RequestProtectedRollbackData,
} from "./protected-change-api-types.js";

export async function requestProtectedPromotion(
  base: string,
  input: Parameters<ApiClient["requestProtectedPromotion"]>[0],
) {
  const body: Record<string, unknown> = {
    draftVersionIds: input.draftVersionIds,
  };
  if (input.comment !== undefined) {
    body.comment = input.comment;
  }
  if (input.impactReviewFingerprint !== undefined) {
    body.impactReviewFingerprint = input.impactReviewFingerprint;
  }
  if (input.operationId !== undefined) {
    body.operationId = input.operationId;
  }
  return authorizedJsonRequest<RequestProtectedPromotionData>(
    base,
    `/v1/orgs/${input.organizationId}/projects/${input.projectId}/environments/${input.environmentId}/promote`,
    input.bearerCredential,
    { method: "POST", body },
  );
}

export async function requestProtectedRollback(
  base: string,
  input: Parameters<ApiClient["requestProtectedRollback"]>[0],
) {
  const body: Record<string, unknown> = {
    toVersion: input.toVersion,
  };
  if (input.promote === true) {
    body.promote = true;
  }
  if (input.comment !== undefined) {
    body.comment = input.comment;
  }
  if (input.operationId !== undefined) {
    body.operationId = input.operationId;
  }
  return authorizedJsonRequest<RequestProtectedRollbackData>(
    base,
    `/v1/orgs/${input.organizationId}/projects/${input.projectId}/environments/${input.environmentId}/secrets/${input.secretId}/rollback`,
    input.bearerCredential,
    { method: "POST", body },
  );
}

export async function listEnvironmentApprovals(
  base: string,
  input: Parameters<ApiClient["listEnvironmentApprovals"]>[0],
) {
  return authorizedJsonRequest<ListEnvironmentApprovalsData>(
    base,
    `/v1/orgs/${input.organizationId}/projects/${input.projectId}/environments/${input.environmentId}/approvals`,
    input.bearerCredential,
    { method: "GET" },
  );
}
