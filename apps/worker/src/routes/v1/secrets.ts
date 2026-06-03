import { AUTHORIZATION_SCOPES } from "@insecur/access";
import type { RequestId } from "@insecur/domain";
import {
  assertSafeSecretValueIngress,
  rejectNamedLocalValueFile,
  writeNonProtectedSecret,
} from "@insecur/secret-store";
import { Hono } from "hono";
import type { Context } from "hono";
import { requireUserActor, type AuthVariables } from "../../auth/middleware.js";
import { authorizeScopeOrThrow } from "../../http/authorize-scope.js";
import { handleRoute } from "../../http/handle-route.js";
import {
  parseEnvironmentIdParam,
  parseProjectIdParam,
  requireRouteParam,
} from "../../http/parse-route-input.js";
import { toAccessActor, toAuditActor } from "../../http/request-actor.js";
import type { WorkerEnv } from "../../env.js";
import { parseSecretWriteBody } from "./parse-secret-write-body.js";

export const secretsRoutes = new Hono<{ Bindings: WorkerEnv; Variables: AuthVariables }>();

async function executeSecretWriteByVariableKey(
  context: Context<{ Bindings: WorkerEnv; Variables: AuthVariables }>,
  reqId: RequestId,
) {
  const userActor = context.get("userActor");
  const projectId = parseProjectIdParam(
    requireRouteParam(context.req.param("projectId"), "projectId"),
  );
  const environmentId = parseEnvironmentIdParam(
    requireRouteParam(context.req.param("environmentId"), "environmentId"),
  );
  const parsed = await parseSecretWriteBody(context.req);

  assertSafeSecretValueIngress("request_body");
  rejectNamedLocalValueFile(parsed.localValueFile);

  const auditActor = toAuditActor(userActor);
  await authorizeScopeOrThrow({
    actor: toAccessActor(userActor),
    auditActor,
    coordinate: {
      organizationId: parsed.organizationId,
      projectId,
      environmentId,
    },
    requiredScope: AUTHORIZATION_SCOPES.secretNonProtectedWrite,
    requestId: reqId,
  });

  return writeNonProtectedSecret({
    organizationId: parsed.organizationId,
    projectId,
    environmentId,
    variableKey: parsed.variableKey,
    actor: auditActor,
    valueUtf8: parsed.valueUtf8,
    ...(parsed.allowEmpty !== undefined ? { allowEmpty: parsed.allowEmpty } : {}),
    ...(parsed.secretId !== undefined ? { secretId: parsed.secretId } : {}),
    request: { requestId: reqId },
  });
}

secretsRoutes.post(
  "/:projectId/environments/:environmentId/secrets/by-variable-key",
  requireUserActor,
  async (context) =>
    handleRoute(context, (reqId) => executeSecretWriteByVariableKey(context, reqId)),
);
