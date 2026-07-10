import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The console root never renders. `/orgs` owns the real routing: unauthenticated visitors go to
 * `/login`, members land in their default organization, org-less members hit onboarding.
 */
export const Route = createFileRoute("/")({
  loader: () => {
    throw redirect({ to: "/orgs" });
  },
});
