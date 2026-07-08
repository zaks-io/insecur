import type { TransitionProtectedChangeRequestInput } from "./transition-protected-change.js";
import { transitionProtectedChange } from "./transition-protected-change.js";
import type { ProtectedChangeRecord } from "./protected-change-types.js";

export async function submitProtectedChangeForApproval(
  input: Omit<TransitionProtectedChangeRequestInput, "nextState" | "accessAction" | "auditAction">,
): Promise<ProtectedChangeRecord> {
  return transitionProtectedChange({
    ...input,
    nextState: "pending_approval",
    accessAction: "submit",
    auditAction: "submitted",
  });
}

export async function approveProtectedChange(
  input: Omit<TransitionProtectedChangeRequestInput, "nextState" | "accessAction" | "auditAction"> &
    Required<
      Pick<TransitionProtectedChangeRequestInput, "impactReviewFingerprint" | "approvalEvidence">
    >,
): Promise<ProtectedChangeRecord> {
  return transitionProtectedChange({
    ...input,
    nextState: "approved",
    accessAction: "approve",
    auditAction: "approved",
  });
}

export async function rejectProtectedChange(
  input: Omit<
    TransitionProtectedChangeRequestInput,
    "nextState" | "accessAction" | "auditAction"
  > & {
    readonly closureReasonCode?: string;
  },
): Promise<ProtectedChangeRecord> {
  return transitionProtectedChange({
    ...input,
    nextState: "rejected",
    accessAction: "reject",
    auditAction: "rejected",
  });
}

export async function cancelProtectedChange(
  input: Omit<TransitionProtectedChangeRequestInput, "nextState" | "accessAction" | "auditAction">,
): Promise<ProtectedChangeRecord> {
  return transitionProtectedChange({
    ...input,
    nextState: "canceled",
    accessAction: "cancel",
    auditAction: "canceled",
  });
}

export async function closeProtectedChangeStale(
  input: Omit<
    TransitionProtectedChangeRequestInput,
    "nextState" | "accessAction" | "auditAction"
  > & {
    readonly closureReasonCode: string;
  },
): Promise<ProtectedChangeRecord> {
  return transitionProtectedChange({
    ...input,
    nextState: "stale",
    accessAction: "submit",
    auditAction: "stale_closed",
  });
}

export async function beginProtectedChangeExecution(
  input: Omit<TransitionProtectedChangeRequestInput, "nextState" | "accessAction" | "auditAction"> &
    Required<Pick<TransitionProtectedChangeRequestInput, "executionOperationId">>,
): Promise<ProtectedChangeRecord> {
  return transitionProtectedChange({
    ...input,
    nextState: "executing",
    accessAction: "execute",
    auditAction: "execution_started",
  });
}

export async function completeProtectedChangeExecution(
  input: Omit<TransitionProtectedChangeRequestInput, "nextState" | "accessAction" | "auditAction">,
): Promise<ProtectedChangeRecord> {
  return transitionProtectedChange({
    ...input,
    nextState: "succeeded",
    accessAction: "execute",
    auditAction: "execution_succeeded",
  });
}

export async function failProtectedChangeExecution(
  input: Omit<
    TransitionProtectedChangeRequestInput,
    "nextState" | "accessAction" | "auditAction"
  > & {
    readonly closureReasonCode?: string;
  },
): Promise<ProtectedChangeRecord> {
  return transitionProtectedChange({
    ...input,
    nextState: "failed",
    accessAction: "execute",
    auditAction: "execution_failed",
  });
}
