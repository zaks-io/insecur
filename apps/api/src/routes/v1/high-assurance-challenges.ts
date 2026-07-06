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
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiEnv } from "../../env.js";
import {
  parseOrganizationAndOperationRouteParams,
  parseOrganizationRouteParam,
} from "./parse-org-route-params.js";

import type { FreshStepUpFactorType } from "@insecur/auth";

export const highAssuranceChallengesRoutes = new Hono<{
  Bindings: ApiEnv;
  Variables: AuthVariables;
}>();

function parseFreshStepUpFactor(value: unknown): FreshStepUpFactorType | undefined {
  if (value === "totp" || value === "generic_otp" || value === "passkey") {
    return value;
  }
  return undefined;
}

async function resolveSessionAssuranceForClear(
  env: ApiEnv,
  userActor: { readonly workosUserId: string },
  body: Record<string, unknown>,
) {
  const { workos } = createAuthContext(env);
  const authFactors = await workos.listAuthFactors(userActor.workosUserId);
  const freshStepUpFactor = parseFreshStepUpFactor(body.freshStepUpFactor);
  const authenticationMethod = readOptionalString(body, "authenticationMethod");

  return {
    authFactors,
    ...(authenticationMethod !== undefined ? { authenticationMethod } : {}),
    ...(freshStepUpFactor !== undefined ? { freshStepUpFactor } : {}),
  };
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

    return runtimeClientFor(context.env, userActor).clearHighAssuranceChallenge({
      organizationId,
      operationId,
      projectId,
      ...(environmentId !== undefined ? { environmentId } : {}),
      sessionAssurance: await resolveSessionAssuranceForClear(context.env, userActor, body),
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
