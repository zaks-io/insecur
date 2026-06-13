import { consumeInjectionGrant, issueInjectionGrant } from "@insecur/runtime-injection";
import { Hono } from "hono";
import { requireUserActor, type AuthVariables } from "../../auth/middleware.js";
import { handleDeliveryRoute, handleRoute } from "../../http/handle-route.js";
import {
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
} from "../../http/parse-route-input.js";
import { runtimeDeliveryEnvelope } from "../../http/runtime-delivery-envelope.js";
import { toAuditActor } from "../../http/request-actor.js";
import type { WorkerEnv } from "../../env.js";
import { createKeyringFromWorkerEnv } from "../../crypto/keyring-context.js";

export const runtimeInjectionRoutes = new Hono<{
  Bindings: WorkerEnv;
  Variables: AuthVariables;
}>();

runtimeInjectionRoutes.post("/grants", requireUserActor, async (context) => {
  return handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const body = parseJsonBody(await context.req.json());
    const organizationId = parseOrganizationIdParam(readRequiredString(body, "organizationId"));
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
    const grantId = parseGrantIdParam(context.req.param("grantId"));
    const body = parseJsonBody(await context.req.json());
    const organizationId = parseOrganizationIdParam(readRequiredString(body, "organizationId"));
    const variableKeyRaw = readOptionalString(body, "variableKey");
    const secretId = parseOptionalSecretId(readOptionalString(body, "secretId"));

    const result = await consumeInjectionGrant({
      keyring: createKeyringFromWorkerEnv(context.env),
      organizationId,
      grantId,
      ...(variableKeyRaw !== undefined
        ? { variableKey: parseVariableKeyField(variableKeyRaw) }
        : {}),
      ...(secretId !== undefined ? { secretId } : {}),
      actor: toAuditActor(userActor),
      request: { requestId: reqId },
    });

    return context.json(
      runtimeDeliveryEnvelope(
        {
          grantId,
          secretId: result.secretId,
          secretVersionId: result.secretVersionId,
          variableKey: result.variableKey,
          valueUtf8: result.valueUtf8,
          ...(result.auditEventId !== undefined ? { auditEventId: result.auditEventId } : {}),
        },
        { requestId: reqId },
      ),
    );
  });
});
