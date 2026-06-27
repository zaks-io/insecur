import { issueInjectionGrant } from "@insecur/runtime-injection-issue";
import {
  handleDeliveryRoute,
  handleRoute,
  parseEnvironmentIdParam,
  parseGrantIdParam,
  parseInjectionGrantIssueSelector,
  parseJsonBody,
  parseOptionalSecretId,
  parseOrganizationIdParam,
  parseProjectIdParam,
  parseVariableKeyField,
  readOptionalString,
  readRequiredString,
  requireRouteParam,
  requireUserActor,
  toAuditActor,
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
      actor: toAuditActor(userActor),
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
    const variableKeyRaw = readOptionalString(body, "variableKey");
    const secretId = parseOptionalSecretId(readOptionalString(body, "secretId"));

    const envelope = await consumeRuntimeGrant(context.env, userActor, {
      organizationId,
      grantId,
      requestId: reqId,
      ...(variableKeyRaw !== undefined
        ? { variableKey: parseVariableKeyField(variableKeyRaw) }
        : {}),
      ...(secretId !== undefined ? { secretId } : {}),
    });

    return context.json(envelope);
  });
});
