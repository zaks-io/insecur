import { isKnownErrorCodeInCatalog } from "@insecur/domain";
import {
  openWizardMutationApi,
  isWizardMutationGateFailure,
} from "../onboarding/wizard-mutation-gate.js";

export type RejectChallengeOutcome =
  { readonly ok: true } | { readonly ok: false; readonly code: string };

export interface RejectChallengeSubmission {
  readonly csrfToken: string;
  readonly organizationId: string;
  readonly operationId: string;
  readonly reason?: string;
}

const MAX_REJECTION_REASON_LENGTH = 500;

/** API hop the reject server-fn needs; the real client is minted per request. */
export interface RejectChallengeApi {
  denyOrgHighAssuranceChallenge(organizationId: string, operationId: string): Promise<unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseRejectChallengeOutcome(body: unknown): RejectChallengeOutcome {
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
  const parsedReason = parseOptionalReason(reason);
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
    return parseRejectChallengeOutcome(response);
  } catch {
    return { ok: false, code: "web.unexpected_response" };
  }
}
