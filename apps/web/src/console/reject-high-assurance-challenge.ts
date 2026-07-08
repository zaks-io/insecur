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

export type RejectChallengeOutcome = ConsoleMutationOutcome;

export interface RejectChallengeSubmission {
  readonly csrfToken: string;
  readonly organizationId: string;
  readonly operationId: string;
  readonly reason?: string;
}

/** API hop the reject server-fn needs; the real client is minted per request. */
export interface RejectChallengeApi {
  denyOrgHighAssuranceChallenge(organizationId: string, operationId: string): Promise<unknown>;
}

export function parseRejectChallengeSubmission(input: unknown): RejectChallengeSubmission | null {
  if (!isRecord(input)) {
    return null;
  }
  const { csrfToken, organizationId, operationId, reason } = input;
  if (
    typeof csrfToken !== "string" ||
    typeof organizationId !== "string" ||
    typeof operationId !== "string"
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
    operationId,
    ...(parsedReason === undefined ? {} : { reason: parsedReason }),
  };
}

/**
 * CSRF-gated reject path: deny the bounded operation over the scoped-token API hop. Optional reason
 * is accepted for the interface voice; durable note persistence lands with Approval Request review.
 */
export async function rejectHighAssuranceChallengeForRequest(
  deps: {
    readonly cookieHeader: string | null;
    readonly resolveApi: () => Promise<RejectChallengeApi | null>;
  },
  data: RejectChallengeSubmission,
): Promise<RejectChallengeOutcome> {
  const opened = await openWizardMutationApi(deps, data.csrfToken);
  if (isWizardMutationGateFailure(opened)) {
    return opened;
  }

  try {
    const response: unknown = await opened.api.denyOrgHighAssuranceChallenge(
      data.organizationId,
      data.operationId,
    );
    return parseConsoleMutationOutcome(response);
  } catch {
    return { ok: false, code: "web.unexpected_response" };
  }
}
