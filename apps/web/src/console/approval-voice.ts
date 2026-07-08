import {
  AUTH_ERROR_CODES,
  HIGH_ASSURANCE_ERROR_CODES,
  OPERATION_ERROR_CODES,
} from "@insecur/domain";

export interface ApprovalActionVoice {
  readonly headline: string;
  readonly detail: string;
  readonly action: "retry" | "sign-in" | "back-to-inbox";
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
    headline: "Rejection isn't available right now",
    detail: "The challenge is no longer waiting for a human decision.",
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

export const REJECT_CHALLENGE_SUCCESS_VOICE: ApprovalActionVoice = {
  headline: "Rejected",
  detail: "The bounded operation was denied. The inbox updates on the next refresh.",
  action: "back-to-inbox",
};
