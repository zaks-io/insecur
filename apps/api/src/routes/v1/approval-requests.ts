import {
  handleRoute,
  parseEnvironmentIdParam,
  parseJsonBody,
  parseProjectIdParam,
  readRequiredString,
  requireUserActor,
  runtimeClientFor,
  createAuthContext,
  createRequestId,
  AuthConfigError,
  AuthFailureError,
  type AuthVariables,
} from "@insecur/worker-kit";
import { resolveHighAssuranceClearAssuranceFromWorkOSStepUp, type UserActor } from "@insecur/auth";
import {
  errorEnvelope,
  readErrorCode,
  requestId,
  VALIDATION_ERROR_CODES,
  type ValidationErrorCode,
} from "@insecur/domain";
import { Hono, type Context } from "hono";
import type { ApiApp, ApiEnv } from "../../env.js";
import { logUnhandledApiError } from "../../log-unhandled-error.js";
import {
  parseOrganizationAndApprovalRequestRouteParams,
  parseOrganizationRouteParam,
} from "./parse-org-route-params.js";

const approvalRequestsRoutes = new Hono<{
  Bindings: ApiEnv;
  Variables: AuthVariables;
}>();

const VALIDATION_ERROR_CODE_SET = new Set<string>(Object.values(VALIDATION_ERROR_CODES));

function readValidationErrorCode(error: unknown): ValidationErrorCode | undefined {
  const code = readErrorCode(error);
  if (code === undefined || !VALIDATION_ERROR_CODE_SET.has(code)) {
    return undefined;
  }
  return code as ValidationErrorCode;
}

function validationErrorResponse(
  context: Context,
  error: unknown,
  code: ValidationErrorCode,
): Response {
  const reqId = createRequestId();
  return context.json(
    errorEnvelope(
      {
        code,
        message: error instanceof Error ? error.message : "invalid approval request body",
        retryable: false,
      },
      { meta: { requestId: reqId } },
    ),
    400,
  );
}

function returnValidationErrorFromThrown(context: Context, error: unknown): Response | undefined {
  const validationCode = readValidationErrorCode(error);
  if (validationCode === undefined) {
    return undefined;
  }
  return validationErrorResponse(context, error, validationCode);
}

function handleApproveSessionAssuranceFailure(context: Context, error: unknown): Response {
  if (error instanceof AuthFailureError || error instanceof AuthConfigError) {
    throw error;
  }
  const validationResponse = returnValidationErrorFromThrown(context, error);
  if (validationResponse !== undefined) {
    return validationResponse;
  }
  logUnhandledApiError(error);
  return context.text("Internal Server Error", 500);
}

function requestHeaderValue(
  context: { req: { header: (name: string) => string | undefined } },
  name: string,
) {
  const value = context.req.header(name);
  return value === undefined || value.trim() === "" ? undefined : value;
}

function requestHeadersForStepUp(context: {
  req: { header: (name: string) => string | undefined };
}): {
  readonly ipAddress?: string;
  readonly userAgent?: string;
} {
  const ipAddress = requestHeaderValue(context, "cf-connecting-ip");
  const userAgent = requestHeaderValue(context, "user-agent");
  return {
    ...(ipAddress === undefined ? {} : { ipAddress }),
    ...(userAgent === undefined ? {} : { userAgent }),
  };
}

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

async function resolveSessionAssuranceForApprove(
  env: ApiEnv,
  userActor: UserActor,
  body: Record<string, unknown>,
  requestHeaders: {
    readonly ipAddress?: string;
    readonly userAgent?: string;
  },
) {
  const stepUpCode = readRequiredString(body, "stepUpCode");
  const stepUpCodeVerifier = readRequiredString(body, "stepUpCodeVerifier");
  const { workos } = createAuthContext(env);
  const resolved = await resolveHighAssuranceClearAssuranceFromWorkOSStepUp({
    workos,
    actor: userActor,
    stepUpCode,
    stepUpCodeVerifier,
    ...(requestHeaders.ipAddress === undefined ? {} : { ipAddress: requestHeaders.ipAddress }),
    ...(requestHeaders.userAgent === undefined ? {} : { userAgent: requestHeaders.userAgent }),
  });
  if (!resolved.ok) {
    const reqId = requestId.generate();
    throw new AuthFailureError(resolved.failure, reqId);
  }
  return resolved.sessionAssurance;
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
    const validationResponse = returnValidationErrorFromThrown(context, error);
    if (validationResponse !== undefined) {
      return validationResponse;
    }
    throw error;
  }

  let sessionAssurance;
  try {
    sessionAssurance = await resolveSessionAssuranceForApprove(
      context.env,
      userActor,
      approveRequest.body,
      requestHeadersForStepUp(context),
    );
  } catch (error) {
    return handleApproveSessionAssuranceFailure(context, error);
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
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const { organizationId, approvalRequestId } =
      parseOrganizationAndApprovalRequestRouteParams(context);
    const detail = await runtimeClientFor(context.env, userActor).getApprovalRequestReview({
      organizationId,
      approvalRequestId,
      requestId: reqId,
    });

    return runtimeClientFor(context.env, userActor).rejectApprovalRequest({
      organizationId,
      approvalRequestId,
      projectId: detail.approvalRequest.projectId,
      environmentId: detail.approvalRequest.environmentId,
      requestId: reqId,
    });
  }),
);

approvalRequestsRoutes.post("/:approvalRequestId/cancel", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const { organizationId, approvalRequestId } =
      parseOrganizationAndApprovalRequestRouteParams(context);
    const detail = await runtimeClientFor(context.env, userActor).getApprovalRequestReview({
      organizationId,
      approvalRequestId,
      requestId: reqId,
    });

    return runtimeClientFor(context.env, userActor).cancelApprovalRequest({
      organizationId,
      approvalRequestId,
      projectId: detail.approvalRequest.projectId,
      environmentId: detail.approvalRequest.environmentId,
      requestId: reqId,
    });
  }),
);

export function registerApprovalRequestsRoutes(app: ApiApp): void {
  app.route("/v1/orgs/:organizationId/approval-requests", approvalRequestsRoutes);
}
