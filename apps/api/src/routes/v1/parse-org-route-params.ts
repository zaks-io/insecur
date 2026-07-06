import type { InjectionGrantId, OperationId, OrganizationId } from "@insecur/domain";
import {
  parseGrantIdParam,
  parseOperationIdParam,
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

export function parseOrganizationAndOperationRouteParams(context: Context): {
  organizationId: OrganizationId;
  operationId: OperationId;
} {
  return {
    organizationId: parseOrganizationRouteParam(context),
    operationId: parseOperationIdParam(
      requireRouteParam(context.req.param("operationId"), "operationId"),
    ),
  };
}
