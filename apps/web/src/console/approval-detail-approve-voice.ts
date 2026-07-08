import {
  approveStepUpFailureVoice,
  clearChallengeSuccessVoice,
  type ApprovalActionVoice,
} from "./approval-voice.js";
import type { ApprovalDetailSearch } from "./approval-detail-search.js";

export function approvalVoiceFromDetailSearch(
  search: ApprovalDetailSearch,
  fallbackOperationId: string,
): ApprovalActionVoice | null {
  if (search.approved === "1") {
    return clearChallengeSuccessVoice({
      operationId: search.operationId ?? fallbackOperationId,
      ...(search.challengeId === undefined ? {} : { challengeId: search.challengeId }),
      ...(search.clearedAt === undefined ? {} : { clearedAt: search.clearedAt }),
    });
  }
  if (search.approve === "failed") {
    return approveStepUpFailureVoice(search.approveReason ?? "factor", search.approveCode);
  }
  return null;
}
