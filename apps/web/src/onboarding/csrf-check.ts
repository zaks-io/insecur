import { validateCsrfToken } from "@insecur/auth";
import { csrfTokenFromCookieHeader } from "./csrf.js";

/**
 * Double-submit CSRF check for wizard mutations: the token carried in the server-fn payload must
 * match the session's CSRF cookie (timing-safe compare via `validateCsrfToken`). Fails closed on
 * a missing cookie or token. Server-side only: `@insecur/auth` must stay out of the browser
 * bundle.
 */
export function isWizardMutationCsrfValid(
  cookieHeader: string | null | undefined,
  submittedToken: string | undefined,
): boolean {
  return validateCsrfToken(csrfTokenFromCookieHeader(cookieHeader), submittedToken);
}
