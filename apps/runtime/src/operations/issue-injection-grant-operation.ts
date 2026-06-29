import type { ActorRef } from "@insecur/access";
import {
  issueInjectionGrant,
  type IssueInjectionGrantResult,
} from "@insecur/runtime-injection-issue";
import type { IssueInjectionGrantRpcInput } from "@insecur/worker-kit";

export interface IssueInjectionGrantOperationInput {
  readonly input: IssueInjectionGrantRpcInput;
  readonly accessActor: ActorRef;
}

export async function issueInjectionGrantOperation({
  input,
  accessActor,
}: IssueInjectionGrantOperationInput): Promise<IssueInjectionGrantResult> {
  return issueInjectionGrant({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    selector: input.selector,
    // issueInjectionGrant now takes the effective-access actor and resolves issuance scope +
    // derives the audit actor internally (main #199). Pass accessActor, not auditActor.
    actor: accessActor,
    request: { requestId: input.requestId },
  });
}
