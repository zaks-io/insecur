import { parseDisplayName } from "@insecur/domain";
import {
  handleRoute,
  parseOptionalDisplayName,
  parseOrganizationIdParam,
  requireUserActor,
  runtimeClientFor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiEnv } from "../../env.js";
import {
  parseOrganizationAndWebhookSubscriptionRouteParams,
  parseOrganizationRouteParam,
} from "./parse-org-route-params.js";

interface UpdateWebhookSubscriptionBody {
  readonly displayName?: string;
  readonly eventCodes?: string[];
  readonly deliveryEmail?: string | null;
  readonly enableEmailChannel?: boolean;
  readonly enableInAppChannel?: boolean;
  readonly status?: "active" | "disabled";
}

function parseUpdateWebhookSubscriptionBody(body: UpdateWebhookSubscriptionBody) {
  const displayName =
    body.displayName === undefined ? undefined : parseOptionalDisplayName(body.displayName);

  return {
    ...(displayName !== undefined ? { displayName } : {}),
    ...(body.eventCodes !== undefined ? { eventCodes: body.eventCodes } : {}),
    ...(body.deliveryEmail !== undefined ? { deliveryEmail: body.deliveryEmail } : {}),
    ...(body.enableEmailChannel !== undefined
      ? { enableEmailChannel: body.enableEmailChannel }
      : {}),
    ...(body.enableInAppChannel !== undefined
      ? { enableInAppChannel: body.enableInAppChannel }
      : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
  };
}

export const webhookSubscriptionsRoutes = new Hono<{
  Bindings: ApiEnv;
  Variables: AuthVariables;
}>();

webhookSubscriptionsRoutes.get("/event-types", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationId = parseOrganizationIdParam(parseOrganizationRouteParam(context));
    return runtimeClientFor(context.env, userActor).listWebhookEventCodes({
      organizationId,
      requestId: reqId,
    });
  }),
);

webhookSubscriptionsRoutes.get("/", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationId = parseOrganizationIdParam(parseOrganizationRouteParam(context));
    return runtimeClientFor(context.env, userActor).listWebhookSubscriptions({
      organizationId,
      requestId: reqId,
    });
  }),
);

webhookSubscriptionsRoutes.post("/", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationId = parseOrganizationIdParam(parseOrganizationRouteParam(context));
    const body = await context.req.json<{
      displayName: string;
      eventCodes: string[];
      deliveryEmail?: string;
      enableEmailChannel?: boolean;
      enableInAppChannel?: boolean;
    }>();
    const displayName = parseDisplayName(body.displayName);
    if (!displayName.ok) {
      throw Object.assign(new Error(displayName.code), { code: displayName.code });
    }
    return runtimeClientFor(context.env, userActor).createWebhookSubscription({
      organizationId,
      requestId: reqId,
      displayName: displayName.value,
      eventCodes: body.eventCodes,
      ...(body.deliveryEmail !== undefined ? { deliveryEmail: body.deliveryEmail } : {}),
      enableEmailChannel: body.enableEmailChannel ?? false,
      enableInAppChannel: body.enableInAppChannel ?? true,
    });
  }),
);

webhookSubscriptionsRoutes.patch("/:subscriptionId", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const { organizationId, subscriptionId } =
      parseOrganizationAndWebhookSubscriptionRouteParams(context);
    const body = await context.req.json<UpdateWebhookSubscriptionBody>();
    const updates = parseUpdateWebhookSubscriptionBody(body);
    return runtimeClientFor(context.env, userActor).updateWebhookSubscription({
      organizationId,
      requestId: reqId,
      subscriptionId,
      ...updates,
    });
  }),
);

webhookSubscriptionsRoutes.delete("/:subscriptionId", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const { organizationId, subscriptionId } =
      parseOrganizationAndWebhookSubscriptionRouteParams(context);
    return runtimeClientFor(context.env, userActor).deleteWebhookSubscription({
      organizationId,
      requestId: reqId,
      subscriptionId,
    });
  }),
);

webhookSubscriptionsRoutes.post(
  "/:subscriptionId/rotate-signing-secret",
  requireUserActor,
  async (context) =>
    handleRoute(context, async (reqId) => {
      const userActor = context.get("userActor");
      const { organizationId, subscriptionId } =
        parseOrganizationAndWebhookSubscriptionRouteParams(context);
      return runtimeClientFor(context.env, userActor).rotateWebhookSigningSecret({
        organizationId,
        requestId: reqId,
        subscriptionId,
      });
    }),
);
