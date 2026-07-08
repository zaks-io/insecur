import {
  handleRoute,
  parseEnvironmentIdParam,
  parseJsonBody,
  parseProjectIdParam,
  readOptionalString,
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
  parseOrganizationAndOperationRouteParams,
  parseOrganizationRouteParam,
} from "./parse-org-route-params.js";

const highAssuranceChallengesRoutes = new Hono<{
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
        message: error instanceof Error ? error.message : "invalid clear request body",
        retryable: false,
      },
      { requestId: reqId },
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

function handleClearSessionAssuranceFailure(context: Context, error: unknown): Response {
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

async function parseHighAssuranceClearRequest(
  context: Context<{
    Bindings: ApiEnv;
    Variables: AuthVariables;
  }>,
) {
  const { organizationId, operationId } = parseOrganizationAndOperationRouteParams(context);
  const body = parseJsonBody(await context.req.json());
  const projectId = parseProjectIdParam(readRequiredString(body, "projectId"));
  const environmentIdRaw = readOptionalString(body, "environmentId");
  const environmentId =
    environmentIdRaw !== undefined ? parseEnvironmentIdParam(environmentIdRaw) : undefined;
  return { organizationId, operationId, body, projectId, environmentId };
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

async function resolveSessionAssuranceForClear(
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

highAssuranceChallengesRoutes.get("/", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    return runtimeClientFor(context.env, userActor).listPendingHighAssuranceChallenges({
      organizationId: parseOrganizationRouteParam(context),
      requestId: reqId,
    });
  }),
);

highAssuranceChallengesRoutes.get("/:operationId", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const { organizationId, operationId } = parseOrganizationAndOperationRouteParams(context);

    return runtimeClientFor(context.env, userActor).getHighAssuranceChallenge({
      organizationId,
      operationId,
      requestId: reqId,
    });
  }),
);

highAssuranceChallengesRoutes.post("/:operationId/clear", requireUserActor, async (context) => {
  const userActor = context.get("userActor");
  let clearRequest;
  try {
    clearRequest = await parseHighAssuranceClearRequest(context);
  } catch (error) {
    const validationResponse = returnValidationErrorFromThrown(context, error);
    if (validationResponse !== undefined) {
      return validationResponse;
    }
    throw error;
  }

  let sessionAssurance;
  try {
    sessionAssurance = await resolveSessionAssuranceForClear(
      context.env,
      userActor,
      clearRequest.body,
      requestHeadersForStepUp(context),
    );
  } catch (error) {
    return handleClearSessionAssuranceFailure(context, error);
  }

  const { organizationId, operationId, projectId, environmentId } = clearRequest;
  return handleRoute(context, async (reqId) =>
    runtimeClientFor(context.env, userActor).clearHighAssuranceChallenge({
      organizationId,
      operationId,
      projectId,
      ...(environmentId !== undefined ? { environmentId } : {}),
      sessionAssurance,
      requestId: reqId,
    }),
  );
});

highAssuranceChallengesRoutes.post("/:operationId/deny", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const { organizationId, operationId } = parseOrganizationAndOperationRouteParams(context);

    return runtimeClientFor(context.env, userActor).denyHighAssuranceChallenge({
      organizationId,
      operationId,
      requestId: reqId,
    });
  }),
);

export function registerHighAssuranceChallengesRoutes(app: ApiApp): void {
  app.route("/v1/orgs/:organizationId/high-assurance-challenges", highAssuranceChallengesRoutes);
}
