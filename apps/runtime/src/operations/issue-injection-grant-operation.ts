import type { AuditActorRef } from "@insecur/audit";
import {
  issueInjectionGrant,
  type IssueInjectionGrantResult,
} from "@insecur/runtime-injection-issue";
import type { IssueInjectionGrantRpcInput } from "@insecur/worker-kit";

export interface IssueInjectionGrantOperationInput {
  readonly input: IssueInjectionGrantRpcInput;
  readonly auditActor: AuditActorRef;
}

export async function issueInjectionGrantOperation({
  input,
  auditActor,
}: IssueInjectionGrantOperationInput): Promise<IssueInjectionGrantResult> {
  return issueInjectionGrant({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    selector: input.selector,
    actor: auditActor,
    request: { requestId: input.requestId },
  });
}
