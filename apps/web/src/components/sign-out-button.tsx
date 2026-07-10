import { Button } from "@insecur/ui";
import type { SyntheticEvent } from "react";
import { LOGOUT_CSRF_FIELD, LOGOUT_PATH } from "../auth/logout-contract.js";
import { csrfTokenFromCookieHeader } from "../onboarding/csrf.js";

function fillCsrfField(event: SyntheticEvent<HTMLFormElement>): void {
  const field = event.currentTarget.elements.namedItem(LOGOUT_CSRF_FIELD);
  if (field instanceof HTMLInputElement) {
    field.value = csrfTokenFromCookieHeader(document.cookie) ?? "";
  }
}

/**
 * The sign-out control shared by the console and onboarding frames. A plain HTML form cannot send
 * the `x-insecur-csrf` header, so the double-submit token is echoed through a hidden form field,
 * read from the non-HttpOnly CSRF cookie at submit time (INS-582). The server still fails closed:
 * a missing or mismatched token is rejected with 403.
 */
export function SignOutButton() {
  return (
    <form method="post" action={LOGOUT_PATH} onSubmit={fillCsrfField}>
      <input type="hidden" name={LOGOUT_CSRF_FIELD} defaultValue="" />
      <Button type="submit" variant="outline" size="sm">
        Sign out
      </Button>
    </form>
  );
}
