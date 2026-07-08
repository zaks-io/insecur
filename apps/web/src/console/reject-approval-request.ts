import {
  openWizardMutationApi,
  isWizardMutationGateFailure,
} from "../onboarding/wizard-mutation-gate.js";
import {
  parseConsoleMutationOutcome,
  parseOptionalRejectionReason,
  type ConsoleMutationOutcome,
} from "./console-mutation-outcome.js";
import { isRecord } from "./approval-parse-helpers.js";

export type RejectApprovalRequestOutcome = ConsoleMutationOutcome;

export interface RejectApprovalRequestSubmission {
  readonly csrfToken: string;
  readonly organizationId: string;
  readonly approvalRequestId: string;
  readonly reason?: string;
}

export interface RejectApprovalRequestApi {
  rejectOrgApprovalRequest(organizationId: string, approvalRequestId: string): Promise<unknown>;
}

export function parseRejectApprovalRequestSubmission(
  input: unknown,
): RejectApprovalRequestSubmission | null {
  if (!isRecord(input)) {
    return null;
  }
  const { csrfToken, organizationId, approvalRequestId, reason } = input;
  if (
    typeof csrfToken !== "string" ||
    typeof organizationId !== "string" ||
    typeof approvalRequestId !== "string"
  ) {
    return null;
  }
  const parsedReason = parseOptionalRejectionReason(reason);
  if (parsedReason === null) {
    return null;
  }
  return {
    csrfToken,
    organizationId,
    approvalRequestId,
    ...(parsedReason === undefined ? {} : { reason: parsedReason }),
  };
}

export async function rejectApprovalRequestForRequest(
  deps: {
    readonly cookieHeader: string | null;
    readonly resolveApi: () => Promise<RejectApprovalRequestApi | null>;
  },
  data: RejectApprovalRequestSubmission,
): Promise<RejectApprovalRequestOutcome> {
  const opened = await openWizardMutationApi(deps, data.csrfToken);
  if (isWizardMutationGateFailure(opened)) {
    return opened;
  }

  try {
    const response = await opened.api.rejectOrgApprovalRequest(
      data.organizationId,
      data.approvalRequestId,
    );
    return parseConsoleMutationOutcome(response);
  } catch {
    return { ok: false, code: "web.unexpected_response" };
  }
}
