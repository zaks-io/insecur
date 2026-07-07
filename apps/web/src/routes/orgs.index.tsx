import { createFileRoute, redirect } from "@tanstack/react-router";
import { ConsoleRouteError } from "../components/console-route-error.js";
import { defaultOrgPath } from "../console/organizations.js";
import { requireConsoleSession } from "../console/route-guards.js";
import { loadConsoleSession } from "../server/console-session.js";

/**
 * Default-org resolution (INS-367): `/orgs` never renders. It sends unauthenticated visitors to
 * `/login`, members to their first organization (the memberships read orders by Display Name),
 * and org-less members to the onboarding placeholder.
 */
export const Route = createFileRoute("/orgs/")({
  loader: async () => {
    const session = requireConsoleSession(await loadConsoleSession(), "/orgs");
    throw redirect({ href: defaultOrgPath(session.organizations) });
  },
  errorComponent: ConsoleRouteError,
});
