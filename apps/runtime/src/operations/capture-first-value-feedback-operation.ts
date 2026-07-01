import { captureFirstValueFeedback } from "@insecur/audit";
import { userId } from "@insecur/domain";
import type {
  CaptureFirstValueFeedbackRpcInput,
  CaptureFirstValueFeedbackRpcPayload,
} from "@insecur/worker-kit";

import type { RuntimeRpcActorContext } from "../rpc/runtime-rpc-entry.js";

export async function captureFirstValueFeedbackOperation(
  input: CaptureFirstValueFeedbackRpcInput,
  actors: RuntimeRpcActorContext,
): Promise<CaptureFirstValueFeedbackRpcPayload> {
  const result = await captureFirstValueFeedback({
    organizationId: input.organizationId,
    actorUserId: userId.brand(actors.actor.userId),
    feedbackKind: input.feedbackKind,
    note: input.note,
    ...(input.grantId !== undefined ? { grantId: input.grantId } : {}),
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
    ...(input.associatedRequestId !== undefined ? { requestId: input.associatedRequestId } : {}),
  });

  return { feedbackId: result.feedbackId };
}
