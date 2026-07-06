import { createFileRoute, redirect } from "@tanstack/react-router";
import { loginRedirectHref } from "../console/login-redirect.js";
import { defaultOrgPath } from "../console/organizations.js";
import { loadConsoleSession } from "../server/console-session.js";

/**
 * Default-org resolution (INS-367): `/orgs` never renders. It sends unauthenticated visitors to
 * `/login`, members to their first organization (the memberships read orders by Display Name),
 * and org-less members to the onboarding placeholder.
 */
export const Route = createFileRoute("/orgs/")({
  loader: async () => {
    const session = await loadConsoleSession();
    if (!session.authenticated) {
      throw redirect({ href: loginRedirectHref("/orgs") });
    }
    throw redirect({ href: defaultOrgPath(session.organizations) });
  },
});
