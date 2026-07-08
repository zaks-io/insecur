import {
  parseEnvironmentIdParam,
  parseOrganizationIdParam,
  parseProjectIdParam,
  requireRouteParam,
  type AuthVariables,
} from "@insecur/worker-kit";
import type { Context } from "hono";
import type { ApiEnv } from "../../env.js";

export function parseEnvironmentScopedRouteParams(
  context: Context<{ Bindings: ApiEnv; Variables: AuthVariables }>,
) {
  return {
    organizationId: parseOrganizationIdParam(
      requireRouteParam(context.req.param("organizationId"), "organizationId"),
    ),
    projectId: parseProjectIdParam(requireRouteParam(context.req.param("projectId"), "projectId")),
    environmentId: parseEnvironmentIdParam(
      requireRouteParam(context.req.param("environmentId"), "environmentId"),
    ),
  };
}
