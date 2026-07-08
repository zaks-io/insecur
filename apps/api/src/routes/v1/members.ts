import {
  handleRoute,
  requireUserActor,
  runtimeClientFor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiApp, ApiEnv } from "../../env.js";
import { parseOrganizationRouteParam } from "./parse-org-route-params.js";

export const membersRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

// The console People members read (INS-373). Authorize-then-read runs atomically in the Runtime
// deploy (ADR-0077): the public edge performs zero DB I/O and forwards a scoped hop token only.
membersRoutes.get("/", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    return runtimeClientFor(context.env, userActor).listOrganizationMembers({
      organizationId: parseOrganizationRouteParam(context),
      requestId: reqId,
    });
  }),
);

export function registerMembersRoutes(app: ApiApp): void {
  app.route("/v1/orgs/:organizationId/members", membersRoutes);
}
