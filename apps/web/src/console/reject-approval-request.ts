import { isKnownErrorCodeInCatalog } from "@insecur/domain";
import {
  openWizardMutationApi,
  isWizardMutationGateFailure,
} from "../onboarding/wizard-mutation-gate.js";

export type RejectApprovalRequestOutcome =
  { readonly ok: true } | { readonly ok: false; readonly code: string };

export interface RejectApprovalRequestSubmission {
  readonly csrfToken: string;
  readonly organizationId: string;
  readonly approvalRequestId: string;
  readonly reason?: string;
}

export interface RejectApprovalRequestApi {
  rejectOrgApprovalRequest(organizationId: string, approvalRequestId: string): Promise<unknown>;
}

const MAX_REJECTION_REASON_LENGTH = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseRejectOutcome(body: unknown): RejectApprovalRequestOutcome {
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

function parseOptionalReason(reason: unknown): string | undefined | null {
  if (reason === undefined) {
    return undefined;
  }
  if (typeof reason !== "string") {
    return null;
  }
  if (reason.length > MAX_REJECTION_REASON_LENGTH) {
    return null;
  }
  return reason === "" ? undefined : reason;
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
  const parsedReason = parseOptionalReason(reason);
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
    return parseRejectOutcome(response);
  } catch {
    return { ok: false, code: "web.unexpected_response" };
  }
}
