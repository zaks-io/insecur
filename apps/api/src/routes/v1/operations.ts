import { AUTHORIZATION_SCOPES } from "@insecur/access";
import { getOperation } from "@insecur/operations";
import {
  authorizeScopeOrThrow,
  handleRoute,
  parseOperationIdParam,
  parseOrganizationIdParam,
  requireRouteParam,
  requireUserActor,
  toAccessActor,
  toAuditActor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiEnv } from "../../env.js";

export const operationsRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

operationsRoutes.get("/:operationId", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationId = parseOrganizationIdParam(
      requireRouteParam(context.req.param("organizationId"), "organizationId"),
    );
    const operationId = parseOperationIdParam(
      requireRouteParam(context.req.param("operationId"), "operationId"),
    );

    await authorizeScopeOrThrow({
      actor: toAccessActor(userActor),
      auditActor: toAuditActor(userActor),
      coordinate: { organizationId },
      requiredScope: AUTHORIZATION_SCOPES.organizationRead,
      requestId: reqId,
    });

    return getOperation({ organizationId, operationId });
  }),
);
