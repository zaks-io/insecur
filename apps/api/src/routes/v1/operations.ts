import {
  handleRoute,
  requireUserActor,
  runtimeClientFor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiApp, ApiEnv } from "../../env.js";
import { parseOrganizationAndOperationRouteParams } from "./parse-org-route-params.js";

const operationsRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

operationsRoutes.post("/:operationId/cancel", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const { organizationId, operationId } = parseOrganizationAndOperationRouteParams(context);

    return runtimeClientFor(context.env, userActor).cancelOperation({
      organizationId,
      operationId,
      requestId: reqId,
    });
  }),
);

// Authorize (organizationRead) then read runs atomically in the Runtime deploy (ADR-0077): the
// public edge does no DB I/O, and operation IDs are not bearer authority, so the scope gate must
// stay co-located with the tenant read it guards.
operationsRoutes.get("/:operationId", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const { organizationId, operationId } = parseOrganizationAndOperationRouteParams(context);

    return runtimeClientFor(context.env, userActor).getOperation({
      organizationId,
      operationId,
      requestId: reqId,
    });
  }),
);

export function registerOperationsRoutes(app: ApiApp): void {
  app.route("/v1/orgs/:organizationId/operations", operationsRoutes);
}
