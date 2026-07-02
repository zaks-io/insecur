import { recordInjectionRunCompleted } from "@insecur/runtime-injection";
import type {
  RecordInjectionRunCompletedRpcInput,
  RecordInjectionRunCompletedRpcPayload,
} from "@insecur/worker-kit";

type RunCompletedAuditActor = Parameters<typeof recordInjectionRunCompleted>[0]["actor"];

export interface RecordInjectionRunCompletedOperationInput {
  readonly input: RecordInjectionRunCompletedRpcInput;
  readonly auditActor: RunCompletedAuditActor;
}

export async function recordInjectionRunCompletedOperation({
  input,
  auditActor,
}: RecordInjectionRunCompletedOperationInput): Promise<RecordInjectionRunCompletedRpcPayload> {
  const result = await recordInjectionRunCompleted({
    organizationId: input.organizationId,
    grantId: input.grantId,
    childExitCode: input.childExitCode,
    actor: auditActor,
    request: { requestId: input.requestId },
  });

  return {
    auditEventId: result.auditEventId,
    alreadyRecorded: result.alreadyRecorded,
  };
}
