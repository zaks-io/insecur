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
  runtimeClientFor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiApp, ApiEnv } from "../../env.js";

const organizationsRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

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

    return runtimeClientFor(context.env, userActor).createOperatorOrganization({
      instanceId: resolveInstanceId(context.env),
      ...(organizationDisplayName !== undefined ? { organizationDisplayName } : {}),
      ...(teamDisplayName !== undefined ? { teamDisplayName } : {}),
      ...(resourceIds !== undefined ? { resourceIds } : {}),
      requestId: reqId,
    });
  });
});

export function registerOrganizationsRoutes(app: ApiApp): void {
  app.route("/v1/orgs/:organizationId/organizations", organizationsRoutes);
}
