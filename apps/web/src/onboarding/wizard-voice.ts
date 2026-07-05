import { ABUSE_ERROR_CODES, AUTH_ERROR_CODES, ONBOARDING_ERROR_CODES } from "@insecur/domain";

export interface WizardErrorVoice {
  readonly headline: string;
  readonly detail: string;
  /** What the wizard offers next: retry the submit, re-enter via login, or continue forward. */
  readonly action: "retry" | "sign-in" | "continue-to-handoff";
}

const SESSION_ENDED: WizardErrorVoice = {
  headline: "Your session ended",
  detail: "Sign in again to pick up where you left off. Nothing was created.",
  action: "sign-in",
};

const NAME_REJECTED: WizardErrorVoice = {
  headline: "That name won't work",
  detail: "Names need at least one visible character and at most 200. Adjust it and continue.",
  action: "retry",
};

const VOICE_BY_CODE: Record<string, WizardErrorVoice> = {
  // Create-only clean conflict (ADR-0063): this wizard session's IDs already exist, which means
  // the earlier submit went through. Forward is the honest direction.
  [ONBOARDING_ERROR_CODES.resourceConflict]: {
    headline: "This workspace already went through",
    detail:
      "An earlier submit finished creating your organization and project. Continue to the CLI handoff; nothing was created twice.",
    action: "continue-to-handoff",
  },
  [ABUSE_ERROR_CODES.rateLimited]: {
    headline: "Too many setup attempts right now",
    detail: "Give it a moment, then try again. Your names are kept.",
    action: "retry",
  },
  [AUTH_ERROR_CODES.required]: SESSION_ENDED,
  [AUTH_ERROR_CODES.expired]: SESSION_ENDED,
  [AUTH_ERROR_CODES.invalid]: SESSION_ENDED,
  "validation.invalid_display_name": NAME_REJECTED,
  "validation.display_name_empty": NAME_REJECTED,
  "web.csrf_rejected": {
    headline: "This request couldn't be verified as yours",
    detail: "Try again. If it happens twice, reload the page to refresh your session.",
    action: "retry",
  },
};

/**
 * Everything the wizard can say when provisioning fails. Wire error text never reaches the
 * screen; each catalogued code maps to the interface's own words and a concrete next move.
 */
export function provisionErrorVoice(code: string): WizardErrorVoice {
  return (
    VOICE_BY_CODE[code] ?? {
      headline: "Setup didn't complete",
      detail: `Nothing was created. Try again; if this keeps happening, mention code ${code}.`,
      action: "retry",
    }
  );
}
