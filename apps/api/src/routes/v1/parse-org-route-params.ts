import type {
  ApprovalRequestId,
  InjectionGrantId,
  OperationId,
  OrganizationId,
  WebhookSubscriptionId,
} from "@insecur/domain";
import {
  parseApprovalRequestIdParam,
  parseGrantIdParam,
  parseOperationIdParam,
  parseOrganizationIdParam,
  parseWebhookSubscriptionIdParam,
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

export function parseOrganizationAndApprovalRequestRouteParams(context: Context): {
  organizationId: OrganizationId;
  approvalRequestId: ApprovalRequestId;
} {
  return {
    organizationId: parseOrganizationRouteParam(context),
    approvalRequestId: parseApprovalRequestIdParam(
      requireRouteParam(context.req.param("approvalRequestId"), "approvalRequestId"),
    ),
  };
}

export function parseOrganizationAndWebhookSubscriptionRouteParams(context: Context): {
  organizationId: OrganizationId;
  subscriptionId: WebhookSubscriptionId;
} {
  return {
    organizationId: parseOrganizationRouteParam(context),
    subscriptionId: parseWebhookSubscriptionIdParam(
      requireRouteParam(context.req.param("subscriptionId"), "subscriptionId"),
    ),
  };
}
