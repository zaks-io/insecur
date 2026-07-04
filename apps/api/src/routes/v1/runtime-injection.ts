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
import { parseChildExitCode } from "@insecur/domain";
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

runtimeInjectionRoutes.post("/grants/:grantId/consume-all", requireUserActor, async (context) => {
  return handleDeliveryRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const { organizationId, grantId } = parseOrganizationAndGrantRouteParams(context);

    const envelope = await runtimeClientFor(context.env, userActor).consumeGrantAll({
      organizationId,
      grantId,
      requestId: reqId,
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
    if (typeof childExitCode !== "number") {
      throw Object.assign(new Error("childExitCode must be a number"), {
        code: "validation.invalid_command_input",
      });
    }
    const parsedChildExitCode = parseChildExitCode(childExitCode);
    if (!parsedChildExitCode.ok) {
      throw Object.assign(new Error("childExitCode is invalid"), {
        code: parsedChildExitCode.code,
      });
    }

    return runtimeClientFor(context.env, userActor).recordInjectionRunCompleted({
      organizationId,
      grantId,
      childExitCode: parsedChildExitCode.value,
      requestId: reqId,
    });
  });
});
