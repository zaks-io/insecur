import {
  AUTH_ERROR_CODES,
  HIGH_ASSURANCE_ERROR_CODES,
  OPERATION_ERROR_CODES,
} from "@insecur/domain";

export interface ApprovalActionVoice {
  readonly headline: string;
  readonly detail: string;
  readonly action: "retry" | "sign-in" | "back-to-inbox" | "enroll-passkey";
}

const SESSION_ENDED: ApprovalActionVoice = {
  headline: "Your session ended",
  detail: "Sign in again to continue reviewing this approval.",
  action: "sign-in",
};

const VOICE_BY_CODE: Record<string, ApprovalActionVoice> = {
  [AUTH_ERROR_CODES.required]: SESSION_ENDED,
  [AUTH_ERROR_CODES.expired]: SESSION_ENDED,
  [AUTH_ERROR_CODES.invalid]: SESSION_ENDED,
  [AUTH_ERROR_CODES.mfaEnrollmentRequired]: {
    headline: "Approval passkey required",
    detail: "Enroll a passkey before you can approve production changes.",
    action: "enroll-passkey",
  },
  "web.csrf_rejected": {
    headline: "This request couldn't be verified as yours",
    detail: "Try again. If it happens twice, reload the page to refresh your session.",
    action: "retry",
  },
  [HIGH_ASSURANCE_ERROR_CODES.alreadyConsumed]: {
    headline: "This challenge already moved on",
    detail: "Someone else may have approved or rejected it. Check the inbox for the current state.",
    action: "back-to-inbox",
  },
  [HIGH_ASSURANCE_ERROR_CODES.evidenceExpired]: {
    headline: "This challenge expired",
    detail:
      "The requesting caller must stage a fresh bounded operation before you can decide again.",
    action: "back-to-inbox",
  },
  [HIGH_ASSURANCE_ERROR_CODES.clearingDenied]: {
    headline: "Approval isn't available right now",
    detail: "The challenge is no longer waiting for a human decision.",
    action: "back-to-inbox",
  },
  [HIGH_ASSURANCE_ERROR_CODES.sessionAssuranceFailed]: {
    headline: "Step-up didn't verify a fresh factor",
    detail: "Try approving again with your passkey or authenticator app.",
    action: "retry",
  },
  [HIGH_ASSURANCE_ERROR_CODES.actorMismatch]: {
    headline: "Only the requesting member can clear this challenge",
    detail: "Sign in as the member who staged the bounded operation, or reject it.",
    action: "back-to-inbox",
  },
  [OPERATION_ERROR_CODES.notFound]: {
    headline: "This approval isn't available",
    detail: "It may have been resolved already or you may not have access to it.",
    action: "back-to-inbox",
  },
};

export function rejectChallengeErrorVoice(code: string): ApprovalActionVoice {
  return (
    VOICE_BY_CODE[code] ?? {
      headline: "Rejection didn't go through",
      detail: `Try again. If this keeps happening, mention code ${code}.`,
      action: "retry",
    }
  );
}

function clearChallengeErrorVoice(code: string): ApprovalActionVoice {
  return (
    VOICE_BY_CODE[code] ?? {
      headline: "Approval didn't go through",
      detail: `Try again. If this keeps happening, mention code ${code}.`,
      action: "retry",
    }
  );
}

export function approveStepUpFailureVoice(
  reason: "factor" | "session" | "unenrolled" | "clear",
  code?: string,
): ApprovalActionVoice {
  if (reason === "unenrolled") {
    return (
      VOICE_BY_CODE[AUTH_ERROR_CODES.mfaEnrollmentRequired] ?? clearChallengeErrorVoice(code ?? "")
    );
  }
  if (reason === "session") {
    return SESSION_ENDED;
  }
  if (reason === "clear" && code !== undefined) {
    return clearChallengeErrorVoice(code);
  }
  return {
    headline: "Step-up didn't complete",
    detail: "Try approving again with your passkey or authenticator app.",
    action: "retry",
  };
}

export const REJECT_CHALLENGE_SUCCESS_VOICE: ApprovalActionVoice = {
  headline: "Rejected",
  detail: "The bounded operation was denied. The inbox updates on the next refresh.",
  action: "back-to-inbox",
};

export function clearChallengeSuccessVoice(input: {
  readonly operationId: string;
  readonly challengeId?: string;
  readonly clearedAt?: string;
}): ApprovalActionVoice {
  const receiptParts = [
    `Operation ${input.operationId}`,
    ...(input.challengeId === undefined ? [] : [`challenge ${input.challengeId}`]),
    ...(input.clearedAt === undefined ? [] : [`cleared at ${input.clearedAt}`]),
  ];
  return {
    headline: "Approved",
    detail: `The bounded operation cleared (${receiptParts.join("; ")}). Waiting CLIs unblock automatically.`,
    action: "back-to-inbox",
  };
}
