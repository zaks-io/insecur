import { createOperatorOrganization } from "@insecur/onboarding";
import {
  handleRoute,
  parseJsonBody,
  parseOperatorOrganizationResourceIds,
  parseOptionalDisplayName,
  parseOrganizationIdParam,
  readOptionalString,
  requireRouteParam,
  requireUserActor,
  resolveInstanceId,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiEnv } from "../../env.js";

export const organizationsRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

organizationsRoutes.post("/", requireUserActor, async (context) => {
  return handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    parseOrganizationIdParam(
      requireRouteParam(context.req.param("organizationId"), "organizationId"),
    );
    const body = parseJsonBody(await context.req.json());
    const organizationDisplayName = parseOptionalDisplayName(
      readOptionalString(body, "organizationDisplayName"),
    );
    const teamDisplayName = parseOptionalDisplayName(readOptionalString(body, "teamDisplayName"));
    const resourceIds = parseOperatorOrganizationResourceIds(body);

    return createOperatorOrganization({
      instanceId: resolveInstanceId(context.env),
      operatorUserId: userActor.userId,
      ...(organizationDisplayName !== undefined ? { organizationDisplayName } : {}),
      ...(teamDisplayName !== undefined ? { teamDisplayName } : {}),
      ...(resourceIds !== undefined ? { resourceIds } : {}),
      request: { requestId: reqId },
    });
  });
});
