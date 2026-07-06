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
  AuthFailureError,
  type AuthVariables,
} from "@insecur/worker-kit";
import { resolveHighAssuranceClearAssuranceFromWorkOSStepUp, type UserActor } from "@insecur/auth";
import { errorEnvelope, requestId, VALIDATION_ERROR_CODES } from "@insecur/domain";
import { Hono } from "hono";
import type { ApiEnv } from "../../env.js";
import {
  parseOrganizationAndOperationRouteParams,
  parseOrganizationRouteParam,
} from "./parse-org-route-params.js";

export const highAssuranceChallengesRoutes = new Hono<{
  Bindings: ApiEnv;
  Variables: AuthVariables;
}>();

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

highAssuranceChallengesRoutes.post("/:operationId/clear", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const { organizationId, operationId } = parseOrganizationAndOperationRouteParams(context);
    const body = parseJsonBody(await context.req.json());
    const projectId = parseProjectIdParam(readRequiredString(body, "projectId"));
    const environmentIdRaw = readOptionalString(body, "environmentId");
    const environmentId =
      environmentIdRaw !== undefined ? parseEnvironmentIdParam(environmentIdRaw) : undefined;

    let sessionAssurance;
    try {
      sessionAssurance = await resolveSessionAssuranceForClear(
        context.env,
        userActor,
        body,
        requestHeadersForStepUp(context),
      );
    } catch (error) {
      if (error instanceof AuthFailureError) {
        throw error;
      }
      return context.json(
        errorEnvelope({
          code: VALIDATION_ERROR_CODES.invalidCommandInput,
          message: error instanceof Error ? error.message : "invalid clear request body",
          retryable: false,
        }),
        400,
      );
    }

    return runtimeClientFor(context.env, userActor).clearHighAssuranceChallenge({
      organizationId,
      operationId,
      projectId,
      ...(environmentId !== undefined ? { environmentId } : {}),
      sessionAssurance,
      requestId: reqId,
    });
  }),
);

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
