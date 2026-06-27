import {
  assertSafeSecretValueIngress,
  rejectNamedLocalValueFile,
} from "@insecur/secret-store-contracts";
import {
  handleRoute,
  parseEnvironmentIdParam,
  parseOrganizationIdParam,
  parseProjectIdParam,
  requireRouteParam,
  requireUserActor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { Context } from "hono";
import type { RequestId } from "@insecur/domain";
import type { ApiEnv } from "../../env.js";
import { writeRuntimeSecret } from "../../rpc/runtime-caller.js";
import { parseSecretWriteBody } from "./parse-secret-write-body.js";

export const secretsRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

async function executeSecretWriteByVariableKey(
  context: Context<{ Bindings: ApiEnv; Variables: AuthVariables }>,
  reqId: RequestId,
) {
  const userActor = context.get("userActor");
  const organizationId = parseOrganizationIdParam(
    requireRouteParam(context.req.param("organizationId"), "organizationId"),
  );
  const projectId = parseProjectIdParam(
    requireRouteParam(context.req.param("projectId"), "projectId"),
  );
  const environmentId = parseEnvironmentIdParam(
    requireRouteParam(context.req.param("environmentId"), "environmentId"),
  );
  const parsed = await parseSecretWriteBody(context.req);

  assertSafeSecretValueIngress("valueUtf8" in parsed ? "request_body" : "generated");
  rejectNamedLocalValueFile(parsed.localValueFile);

  const writeInput =
    "valueUtf8" in parsed ? { valueUtf8: parsed.valueUtf8 } : { generate: parsed.generate };

  return writeRuntimeSecret(context.env, userActor, {
    organizationId,
    projectId,
    environmentId,
    variableKey: parsed.variableKey,
    ...writeInput,
    requestId: reqId,
    ...(parsed.allowEmpty !== undefined ? { allowEmpty: parsed.allowEmpty } : {}),
    ...(parsed.secretId !== undefined ? { secretId: parsed.secretId } : {}),
  });
}

secretsRoutes.post(
  "/:projectId/environments/:environmentId/secrets/by-variable-key",
  requireUserActor,
  async (context) =>
    handleRoute(context, (reqId) => executeSecretWriteByVariableKey(context, reqId)),
);
