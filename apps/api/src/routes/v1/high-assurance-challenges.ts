import {
  handleRoute,
  parseEnvironmentIdParam,
  parseJsonBody,
  parseProjectIdParam,
  readOptionalString,
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
  parseOrganizationAndOperationRouteParams,
  parseOrganizationRouteParam,
} from "./parse-org-route-params.js";

const highAssuranceChallengesRoutes = new Hono<{
  Bindings: ApiEnv;
  Variables: AuthVariables;
}>();

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
    const validationResponse = returnUserRouteValidationErrorFromThrown(
      context,
      error,
      "invalid clear request body",
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
      clearRequest.body,
      requestHeadersForWorkOSStepUp(context),
    );
  } catch (error) {
    return handleUserRouteSessionAssuranceFailure(context, error, "invalid clear request body");
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
