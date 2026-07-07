import type {
  CaptureFirstValueFeedbackRpcInput,
  CaptureFirstValueFeedbackRpcPayload,
  FirstValueUsageStatusRpcPayload,
  QueryFirstValueUsageRpcInput,
  CancelOperationRpcInput,
  CancelOperationRpcPayload,
  CreateEnvironmentRpcInput,
  CreateEnvironmentRpcPayload,
  CreateProjectRpcInput,
  CreateProjectRpcPayload,
  GetOperationRpcInput,
  IssueInjectionGrantRpcInput,
  ListAuditEventsRpcInput,
  ListAuditEventsRpcPayload,
  ListEnvironmentsRpcInput,
  ListEnvironmentsRpcPayload,
  ListEnvironmentSecretsRpcInput,
  ListEnvironmentSecretsRpcPayload,
  ListOrganizationInvitationsRpcInput,
  ListOrganizationInvitationsRpcPayload,
  ListOrganizationMembersRpcInput,
  ListOrganizationMembersRpcPayload,
  ListProjectSecretsRpcInput,
  ListProjectSecretsRpcPayload,
  ListProjectsRpcInput,
  ListProjectsRpcPayload,
  ListSecretVersionsRpcInput,
  ListSecretVersionsRpcPayload,
  ListSessionOrganizationsRpcInput,
  ListSessionOrganizationsRpcPayload,
  RecordInjectionRunCompletedRpcInput,
  RecordInjectionRunCompletedRpcPayload,
  RevokeCliSessionRpcInput,
  RevokeCliSessionRpcPayload,
  RuntimeRpcResult,
} from "@insecur/worker-kit";
import type { OperationPollResult } from "@insecur/operations";
import {
  issueInjectionGrant,
  type IssueInjectionGrantResult,
} from "@insecur/runtime-injection-issue";

import { captureFirstValueFeedbackOperation } from "../operations/capture-first-value-feedback-operation.js";
import { queryFirstValueUsageOperation } from "../operations/query-first-value-usage-operation.js";
import { getOperationOperation } from "../operations/get-operation-operation.js";
import { cancelOperationOperation } from "../operations/cancel-operation-operation.js";
import { listAuditEventsOperation } from "../operations/list-audit-events-operation.js";
import { listEnvironmentsOperation } from "../operations/list-environments-operation.js";
import { createEnvironmentOperation } from "../operations/create-environment-operation.js";
import { createProjectOperation } from "../operations/create-project-operation.js";
import { listEnvironmentSecretsOperation } from "../operations/list-environment-secrets-operation.js";
import { listOrganizationInvitationsOperation } from "../operations/list-organization-invitations-operation.js";
import { listOrganizationMembersOperation } from "../operations/list-organization-members-operation.js";
import { listProjectSecretsOperation } from "../operations/list-project-secrets-operation.js";
import { listSecretVersionsOperation } from "../operations/list-secret-versions-operation.js";
import { listProjectsOperation } from "../operations/list-projects-operation.js";
import { listSessionOrganizationsOperation } from "../operations/list-session-organizations-operation.js";
import { revokeCliSessionOperation } from "../operations/revoke-cli-session-operation.js";
import { recordInjectionRunCompletedOperation } from "../operations/record-injection-run-completed-operation.js";
import type { PostAuthRpcRunner } from "./post-auth-rpc-runner.js";

export function listProjectsRpc(
  post: PostAuthRpcRunner,
  input: ListProjectsRpcInput,
): Promise<RuntimeRpcResult<ListProjectsRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    listProjectsOperation({ input, auditActor, accessActor }),
  );
}

export function createProjectRpc(
  post: PostAuthRpcRunner,
  input: CreateProjectRpcInput,
): Promise<RuntimeRpcResult<CreateProjectRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    createProjectOperation({ input, auditActor, accessActor }),
  );
}

export function getOperationRpc(
  post: PostAuthRpcRunner,
  input: GetOperationRpcInput,
): Promise<RuntimeRpcResult<OperationPollResult>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    getOperationOperation({ input, auditActor, accessActor }),
  );
}

export function cancelOperationRpc(
  post: PostAuthRpcRunner,
  input: CancelOperationRpcInput,
): Promise<RuntimeRpcResult<CancelOperationRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    cancelOperationOperation({ input, auditActor, accessActor }),
  );
}

export function issueInjectionGrantRpc(
  post: PostAuthRpcRunner,
  input: IssueInjectionGrantRpcInput,
): Promise<RuntimeRpcResult<IssueInjectionGrantResult>> {
  return post(input.actorToken, ({ accessActor }) =>
    issueInjectionGrant({
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      selector: input.selector,
      actor: accessActor,
      request: { requestId: input.requestId },
    }),
  );
}

export function listSessionOrganizationsRpc(
  post: PostAuthRpcRunner,
  input: ListSessionOrganizationsRpcInput,
): Promise<RuntimeRpcResult<ListSessionOrganizationsRpcPayload>> {
  return post(input.actorToken, ({ accessActor }) =>
    listSessionOrganizationsOperation({ accessActor }),
  );
}

export function revokeCliSessionRpc(
  post: PostAuthRpcRunner,
  input: RevokeCliSessionRpcInput,
): Promise<RuntimeRpcResult<RevokeCliSessionRpcPayload>> {
  return post(input.actorToken, ({ actor }) =>
    revokeCliSessionOperation({ instanceId: input.instanceId, actor }),
  );
}

export function listOrganizationMembersRpc(
  post: PostAuthRpcRunner,
  input: ListOrganizationMembersRpcInput,
): Promise<RuntimeRpcResult<ListOrganizationMembersRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    listOrganizationMembersOperation({ input, auditActor, accessActor }),
  );
}

export function listOrganizationInvitationsRpc(
  post: PostAuthRpcRunner,
  input: ListOrganizationInvitationsRpcInput,
): Promise<RuntimeRpcResult<ListOrganizationInvitationsRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    listOrganizationInvitationsOperation({ input, auditActor, accessActor }),
  );
}

export function listAuditEventsRpc(
  post: PostAuthRpcRunner,
  input: ListAuditEventsRpcInput,
): Promise<RuntimeRpcResult<ListAuditEventsRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    listAuditEventsOperation({ input, auditActor, accessActor }),
  );
}

export function listEnvironmentsRpc(
  post: PostAuthRpcRunner,
  input: ListEnvironmentsRpcInput,
): Promise<RuntimeRpcResult<ListEnvironmentsRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    listEnvironmentsOperation({ input, auditActor, accessActor }),
  );
}

export function createEnvironmentRpc(
  post: PostAuthRpcRunner,
  input: CreateEnvironmentRpcInput,
): Promise<RuntimeRpcResult<CreateEnvironmentRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    createEnvironmentOperation({ input, auditActor, accessActor }),
  );
}

export function listProjectSecretsRpc(
  post: PostAuthRpcRunner,
  input: ListProjectSecretsRpcInput,
): Promise<RuntimeRpcResult<ListProjectSecretsRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    listProjectSecretsOperation({ input, auditActor, accessActor }),
  );
}

export function listEnvironmentSecretsRpc(
  post: PostAuthRpcRunner,
  input: ListEnvironmentSecretsRpcInput,
): Promise<RuntimeRpcResult<ListEnvironmentSecretsRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    listEnvironmentSecretsOperation({ input, auditActor, accessActor }),
  );
}

export function listSecretVersionsRpc(
  post: PostAuthRpcRunner,
  input: ListSecretVersionsRpcInput,
): Promise<RuntimeRpcResult<ListSecretVersionsRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    listSecretVersionsOperation({ input, auditActor, accessActor }),
  );
}

export function recordInjectionRunCompletedRpc(
  post: PostAuthRpcRunner,
  input: RecordInjectionRunCompletedRpcInput,
): Promise<RuntimeRpcResult<RecordInjectionRunCompletedRpcPayload>> {
  return post(input.actorToken, ({ auditActor }) =>
    recordInjectionRunCompletedOperation({ input, auditActor }),
  );
}

export function captureFirstValueFeedbackRpc(
  post: PostAuthRpcRunner,
  input: CaptureFirstValueFeedbackRpcInput,
): Promise<RuntimeRpcResult<CaptureFirstValueFeedbackRpcPayload>> {
  return post(input.actorToken, (actors) => captureFirstValueFeedbackOperation(input, actors));
}

export function queryFirstValueUsageRpc(
  post: PostAuthRpcRunner,
  input: QueryFirstValueUsageRpcInput,
): Promise<RuntimeRpcResult<FirstValueUsageStatusRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    queryFirstValueUsageOperation({ input, auditActor, accessActor }),
  );
}
