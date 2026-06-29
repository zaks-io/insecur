import { issueInjectionGrant } from "@insecur/runtime-injection-issue";
import {
  handleDeliveryRoute,
  handleRoute,
  parseEnvironmentIdParam,
  parseGrantIdParam,
  parseInjectionGrantConsumeSelector,
  parseInjectionGrantIssueSelector,
  parseJsonBody,
  parseOrganizationIdParam,
  parseProjectIdParam,
  readRequiredString,
  requireRouteParam,
  requireUserActor,
  toAccessActor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiEnv } from "../../env.js";
import { consumeRuntimeGrant } from "../../rpc/runtime-caller.js";

export const runtimeInjectionRoutes = new Hono<{
  Bindings: ApiEnv;
  Variables: AuthVariables;
}>();

runtimeInjectionRoutes.post("/grants", requireUserActor, async (context) => {
  return handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationId = parseOrganizationIdParam(
      requireRouteParam(context.req.param("organizationId"), "organizationId"),
    );
    const body = parseJsonBody(await context.req.json());
    const projectId = parseProjectIdParam(readRequiredString(body, "projectId"));
    const environmentId = parseEnvironmentIdParam(readRequiredString(body, "environmentId"));
    const selector = parseInjectionGrantIssueSelector(body);

    return issueInjectionGrant({
      organizationId,
      projectId,
      environmentId,
      selector,
      actor: toAccessActor(userActor),
      request: { requestId: reqId },
    });
  });
});

runtimeInjectionRoutes.post("/grants/:grantId/consume", requireUserActor, async (context) => {
  return handleDeliveryRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationId = parseOrganizationIdParam(
      requireRouteParam(context.req.param("organizationId"), "organizationId"),
    );
    const grantId = parseGrantIdParam(context.req.param("grantId"));
    const body = parseJsonBody(await context.req.json());
    const selector = parseInjectionGrantConsumeSelector(body);

    const envelope = await consumeRuntimeGrant(context.env, userActor, {
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
