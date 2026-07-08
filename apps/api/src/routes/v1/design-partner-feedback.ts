import {
  handleRoute,
  parseGrantIdParam,
  parseJsonBody,
  parseOperationIdParam,
  parseRequestIdParam,
  readOptionalString,
  readRequiredString,
  requireUserActor,
  runtimeClientFor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiApp, ApiEnv } from "../../env.js";
import { parseOrganizationRouteParam } from "./parse-org-route-params.js";

export const designPartnerFeedbackRoutes = new Hono<{
  Bindings: ApiEnv;
  Variables: AuthVariables;
}>();

designPartnerFeedbackRoutes.post("/", requireUserActor, async (context) => {
  return handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationId = parseOrganizationRouteParam(context);
    const body = parseJsonBody(await context.req.json());
    const feedbackKind = readRequiredString(body, "feedbackKind");
    const noteCode = readRequiredString(body, "noteCode");
    const grantIdRaw = readOptionalString(body, "grantId");
    const operationIdRaw = readOptionalString(body, "operationId");
    const associatedRequestIdRaw = readOptionalString(body, "associatedRequestId");

    return runtimeClientFor(context.env, userActor).captureFirstValueFeedback({
      organizationId,
      feedbackKind,
      noteCode,
      requestId: reqId,
      ...(grantIdRaw !== undefined ? { grantId: parseGrantIdParam(grantIdRaw) } : {}),
      ...(operationIdRaw !== undefined
        ? { operationId: parseOperationIdParam(operationIdRaw) }
        : {}),
      ...(associatedRequestIdRaw !== undefined
        ? { associatedRequestId: parseRequestIdParam(associatedRequestIdRaw) }
        : {}),
    });
  });
});

export function registerDesignPartnerFeedbackRoutes(app: ApiApp): void {
  app.route("/v1/orgs/:organizationId/design-partner-feedback", designPartnerFeedbackRoutes);
}
