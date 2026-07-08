import { isKnownErrorCodeInCatalog } from "@insecur/domain";
import {
  openWizardMutationApi,
  isWizardMutationGateFailure,
} from "../onboarding/wizard-mutation-gate.js";

export type CancelApprovalRequestOutcome =
  { readonly ok: true } | { readonly ok: false; readonly code: string };

export interface CancelApprovalRequestSubmission {
  readonly csrfToken: string;
  readonly organizationId: string;
  readonly approvalRequestId: string;
}

export interface CancelApprovalRequestApi {
  cancelOrgApprovalRequest(organizationId: string, approvalRequestId: string): Promise<unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseCancelOutcome(body: unknown): CancelApprovalRequestOutcome {
  if (isRecord(body) && body.ok === true) {
    return { ok: true };
  }
  if (isRecord(body) && body.ok === false && isRecord(body.error)) {
    const code = body.error.code;
    if (typeof code === "string" && isKnownErrorCodeInCatalog(code)) {
      return { ok: false, code };
    }
  }
  return { ok: false, code: "web.unexpected_response" };
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
    return parseCancelOutcome(response);
  } catch {
    return { ok: false, code: "web.unexpected_response" };
  }
}
