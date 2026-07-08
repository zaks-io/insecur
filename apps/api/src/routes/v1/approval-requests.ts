import {
  handleRoute,
  parseEnvironmentIdParam,
  parseJsonBody,
  parseProjectIdParam,
  readRequiredString,
  requireUserActor,
  runtimeClientFor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono, type Context } from "hono";
import type { ApiApp, ApiEnv } from "../../env.js";
import {
  handleUserRouteSessionAssuranceFailure,
  requestHeadersForWorkOSStepUp,
  returnUserRouteValidationErrorFromThrown,
} from "./user-route-validation.js";
import { resolveWorkOSSessionAssuranceFromStepUp } from "./user-route-step-up.js";
import {
  parseOrganizationAndApprovalRequestRouteParams,
  parseOrganizationRouteParam,
} from "./parse-org-route-params.js";

const approvalRequestsRoutes = new Hono<{
  Bindings: ApiEnv;
  Variables: AuthVariables;
}>();

async function parseApprovalApproveRequest(
  context: Context<{
    Bindings: ApiEnv;
    Variables: AuthVariables;
  }>,
) {
  const { organizationId, approvalRequestId } =
    parseOrganizationAndApprovalRequestRouteParams(context);
  const body = parseJsonBody(await context.req.json());
  const projectId = parseProjectIdParam(readRequiredString(body, "projectId"));
  const environmentId = parseEnvironmentIdParam(readRequiredString(body, "environmentId"));
  const impactReviewFingerprint = readRequiredString(body, "impactReviewFingerprint");
  return {
    organizationId,
    approvalRequestId,
    body,
    projectId,
    environmentId,
    impactReviewFingerprint,
  };
}

async function runApprovalRequestDecision(
  context: Context<{ Bindings: ApiEnv; Variables: AuthVariables }>,
  action: "reject" | "cancel",
) {
  return handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const { organizationId, approvalRequestId } =
      parseOrganizationAndApprovalRequestRouteParams(context);
    const client = runtimeClientFor(context.env, userActor);
    const detail = await client.getApprovalRequestReview({
      organizationId,
      approvalRequestId,
      requestId: reqId,
    });
    const coordinates = {
      organizationId,
      approvalRequestId,
      projectId: detail.approvalRequest.projectId,
      environmentId: detail.approvalRequest.environmentId,
      requestId: reqId,
    };
    return action === "reject"
      ? client.rejectApprovalRequest(coordinates)
      : client.cancelApprovalRequest(coordinates);
  });
}

approvalRequestsRoutes.get("/", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    return runtimeClientFor(context.env, userActor).listPendingApprovalRequests({
      organizationId: parseOrganizationRouteParam(context),
      requestId: reqId,
    });
  }),
);

approvalRequestsRoutes.get("/:approvalRequestId", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const { organizationId, approvalRequestId } =
      parseOrganizationAndApprovalRequestRouteParams(context);

    return runtimeClientFor(context.env, userActor).getApprovalRequestReview({
      organizationId,
      approvalRequestId,
      requestId: reqId,
    });
  }),
);

approvalRequestsRoutes.post("/:approvalRequestId/approve", requireUserActor, async (context) => {
  const userActor = context.get("userActor");
  let approveRequest;
  try {
    approveRequest = await parseApprovalApproveRequest(context);
  } catch (error) {
    const validationResponse = returnUserRouteValidationErrorFromThrown(
      context,
      error,
      "invalid approval request body",
    );
    if (validationResponse !== undefined) {
      return validationResponse;
    }
    throw error;
  }

  let sessionAssurance;
  try {
    sessionAssurance = await resolveWorkOSSessionAssuranceFromStepUp(
      context.env,
      userActor,
      approveRequest.body,
      requestHeadersForWorkOSStepUp(context),
    );
  } catch (error) {
    return handleUserRouteSessionAssuranceFailure(context, error, "invalid approval request body");
  }

  const { organizationId, approvalRequestId, projectId, environmentId, impactReviewFingerprint } =
    approveRequest;
  return handleRoute(context, async (reqId) =>
    runtimeClientFor(context.env, userActor).approveApprovalRequest({
      organizationId,
      approvalRequestId,
      projectId,
      environmentId,
      impactReviewFingerprint,
      sessionAssurance,
      requestId: reqId,
    }),
  );
});

approvalRequestsRoutes.post("/:approvalRequestId/reject", requireUserActor, async (context) =>
  runApprovalRequestDecision(context, "reject"),
);

approvalRequestsRoutes.post("/:approvalRequestId/cancel", requireUserActor, async (context) =>
  runApprovalRequestDecision(context, "cancel"),
);

export function registerApprovalRequestsRoutes(app: ApiApp): void {
  app.route("/v1/orgs/:organizationId/approval-requests", approvalRequestsRoutes);
}
