import {
  handleRoute,
  parseOrganizationIdParam,
  requireUserActor,
  runtimeClientFor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiApp, ApiEnv } from "../../env.js";
import { parseOrganizationRouteParam } from "./parse-org-route-params.js";

export const firstValueUsageRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

// First Value usage status for the onboarding handoff indicator (INS-379). Authorize-then-read runs
// atomically in the Runtime deploy (ADR-0077): the public edge performs zero DB I/O.
firstValueUsageRoutes.get("/", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationId = parseOrganizationIdParam(parseOrganizationRouteParam(context));

    return runtimeClientFor(context.env, userActor).queryFirstValueUsage({
      organizationId,
      requestId: reqId,
    });
  }),
);

export function registerFirstValueUsageRoutes(app: ApiApp): void {
  app.route("/v1/orgs/:organizationId/first-value-usage", firstValueUsageRoutes);
}
