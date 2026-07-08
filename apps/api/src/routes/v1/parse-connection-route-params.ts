import type { AppConnectionId, OrganizationId } from "@insecur/domain";
import { parseAppConnectionIdParam, requireRouteParam } from "@insecur/worker-kit";
import type { Context } from "hono";

import { parseOrganizationRouteParam } from "./parse-org-route-params.js";

export function parseOrganizationAndAppConnectionRouteParams(context: Context): {
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
} {
  return {
    organizationId: parseOrganizationRouteParam(context),
    appConnectionId: parseAppConnectionIdParam(
      requireRouteParam(context.req.param("connectionId"), "connectionId"),
    ),
  };
}
