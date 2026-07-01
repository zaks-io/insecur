import {
  handleDeliveryRoute,
  handleRoute,
  parseEnvironmentIdParam,
  parseInjectionGrantConsumeSelector,
  parseInjectionGrantIssueSelector,
  parseJsonBody,
  parseProjectIdParam,
  readRequiredString,
  requireUserActor,
  runtimeClientFor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiEnv } from "../../env.js";
import {
  parseOrganizationAndGrantRouteParams,
  parseOrganizationRouteParam,
} from "./parse-org-route-params.js";

export const runtimeInjectionRoutes = new Hono<{
  Bindings: ApiEnv;
  Variables: AuthVariables;
}>();

runtimeInjectionRoutes.post("/grants", requireUserActor, async (context) => {
  return handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationId = parseOrganizationRouteParam(context);
    const body = parseJsonBody(await context.req.json());
    const projectId = parseProjectIdParam(readRequiredString(body, "projectId"));
    const environmentId = parseEnvironmentIdParam(readRequiredString(body, "environmentId"));
    const selector = parseInjectionGrantIssueSelector(body);

    return runtimeClientFor(context.env, userActor).issueInjectionGrant({
      organizationId,
      projectId,
      environmentId,
      selector,
      requestId: reqId,
    });
  });
});

runtimeInjectionRoutes.post("/grants/:grantId/consume", requireUserActor, async (context) => {
  return handleDeliveryRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const { organizationId, grantId } = parseOrganizationAndGrantRouteParams(context);
    const body = parseJsonBody(await context.req.json());
    const selector = parseInjectionGrantConsumeSelector(body);

    const envelope = await runtimeClientFor(context.env, userActor).consumeGrant({
      organizationId,
      grantId,
      requestId: reqId,
      ...(selector.kind === "variable_key"
        ? { variableKey: selector.variableKey }
        : { secretId: selector.secretId }),
    });

    return context.json(envelope);
  });
});

runtimeInjectionRoutes.post("/grants/:grantId/run-completed", requireUserActor, async (context) => {
  return handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const { organizationId, grantId } = parseOrganizationAndGrantRouteParams(context);
    const body = parseJsonBody(await context.req.json());
    const childExitCode = body.childExitCode;
    if (typeof childExitCode !== "number" || !Number.isInteger(childExitCode)) {
      throw Object.assign(new Error("childExitCode must be an integer"), {
        code: "validation.invalid_command_input",
      });
    }

    return runtimeClientFor(context.env, userActor).recordInjectionRunCompleted({
      organizationId,
      grantId,
      childExitCode,
      requestId: reqId,
    });
  });
});
