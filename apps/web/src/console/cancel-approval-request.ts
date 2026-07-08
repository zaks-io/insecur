import {
  openWizardMutationApi,
  isWizardMutationGateFailure,
} from "../onboarding/wizard-mutation-gate.js";
import {
  parseConsoleMutationOutcome,
  type ConsoleMutationOutcome,
} from "./console-mutation-outcome.js";
import { isRecord } from "./approval-parse-helpers.js";

export type CancelApprovalRequestOutcome = ConsoleMutationOutcome;

export interface CancelApprovalRequestSubmission {
  readonly csrfToken: string;
  readonly organizationId: string;
  readonly approvalRequestId: string;
}

export interface CancelApprovalRequestApi {
  cancelOrgApprovalRequest(organizationId: string, approvalRequestId: string): Promise<unknown>;
}

export function parseCancelApprovalRequestSubmission(
  input: unknown,
): CancelApprovalRequestSubmission | null {
  if (!isRecord(input)) {
    return null;
  }
  const { csrfToken, organizationId, approvalRequestId } = input;
  if (
    typeof csrfToken !== "string" ||
    typeof organizationId !== "string" ||
    typeof approvalRequestId !== "string"
  ) {
    return null;
  }
  return { csrfToken, organizationId, approvalRequestId };
}

export async function cancelApprovalRequestForRequest(
  deps: {
    readonly cookieHeader: string | null;
    readonly resolveApi: () => Promise<CancelApprovalRequestApi | null>;
  },
  data: CancelApprovalRequestSubmission,
): Promise<CancelApprovalRequestOutcome> {
  const opened = await openWizardMutationApi(deps, data.csrfToken);
  if (isWizardMutationGateFailure(opened)) {
    return opened;
  }

  try {
    const response = await opened.api.cancelOrgApprovalRequest(
      data.organizationId,
      data.approvalRequestId,
    );
    return parseConsoleMutationOutcome(response);
  } catch {
    return { ok: false, code: "web.unexpected_response" };
  }
}
