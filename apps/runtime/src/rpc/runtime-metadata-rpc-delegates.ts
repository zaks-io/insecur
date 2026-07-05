import type {
  CaptureFirstValueFeedbackRpcInput,
  CaptureFirstValueFeedbackRpcPayload,
  GetOperationRpcInput,
  IssueInjectionGrantRpcInput,
  ListEnvironmentsRpcInput,
  ListEnvironmentsRpcPayload,
  ListProjectsRpcInput,
  ListProjectsRpcPayload,
  RecordInjectionRunCompletedRpcInput,
  RecordInjectionRunCompletedRpcPayload,
  RuntimeRpcResult,
} from "@insecur/worker-kit";
import type { OperationPollResult } from "@insecur/operations";
import {
  issueInjectionGrant,
  type IssueInjectionGrantResult,
} from "@insecur/runtime-injection-issue";

import { captureFirstValueFeedbackOperation } from "../operations/capture-first-value-feedback-operation.js";
import { getOperationOperation } from "../operations/get-operation-operation.js";
import { listEnvironmentsOperation } from "../operations/list-environments-operation.js";
import { listProjectsOperation } from "../operations/list-projects-operation.js";
import { recordInjectionRunCompletedOperation } from "../operations/record-injection-run-completed-operation.js";
import type { RuntimeRpcActorContext } from "./runtime-rpc-entry.js";

type PostAuthRpcRunner = <T>(
  actorToken: string,
  run: (actors: RuntimeRpcActorContext) => Promise<T>,
) => Promise<RuntimeRpcResult<T>>;

export function listProjectsRpc(
  post: PostAuthRpcRunner,
  input: ListProjectsRpcInput,
): Promise<RuntimeRpcResult<ListProjectsRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    listProjectsOperation({ input, auditActor, accessActor }),
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

export function listEnvironmentsRpc(
  post: PostAuthRpcRunner,
  input: ListEnvironmentsRpcInput,
): Promise<RuntimeRpcResult<ListEnvironmentsRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    listEnvironmentsOperation({ input, auditActor, accessActor }),
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
