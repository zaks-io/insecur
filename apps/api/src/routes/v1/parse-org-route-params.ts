import type { InjectionGrantId, OrganizationId } from "@insecur/domain";
import {
  parseGrantIdParam,
  parseOrganizationIdParam,
  requireRouteParam,
} from "@insecur/worker-kit";
import type { Context } from "hono";

export function parseOrganizationRouteParam(context: Context): OrganizationId {
  return parseOrganizationIdParam(
    requireRouteParam(context.req.param("organizationId"), "organizationId"),
  );
}

export function parseOrganizationAndGrantRouteParams(context: Context): {
  organizationId: OrganizationId;
  grantId: InjectionGrantId;
} {
  return {
    organizationId: parseOrganizationRouteParam(context),
    grantId: parseGrantIdParam(requireRouteParam(context.req.param("grantId"), "grantId")),
  };
}
