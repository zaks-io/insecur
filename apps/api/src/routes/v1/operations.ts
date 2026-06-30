import {
  handleRoute,
  parseOperationIdParam,
  parseOrganizationIdParam,
  requireRouteParam,
  requireUserActor,
  runtimeClientFor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiEnv } from "../../env.js";

export const operationsRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

// Authorize (organizationRead) then read runs atomically in the Runtime deploy (ADR-0077): the
// public edge does no DB I/O, and operation IDs are not bearer authority, so the scope gate must
// stay co-located with the tenant read it guards.
operationsRoutes.get("/:operationId", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationId = parseOrganizationIdParam(
      requireRouteParam(context.req.param("organizationId"), "organizationId"),
    );
    const operationId = parseOperationIdParam(
      requireRouteParam(context.req.param("operationId"), "operationId"),
    );

    return runtimeClientFor(context.env, userActor).getOperation({
      organizationId,
      operationId,
      requestId: reqId,
    });
  }),
);
