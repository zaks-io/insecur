import {
  handleRoute,
  parseEnvironmentIdParam,
  parseJsonBody,
  parseOperationIdParam,
  parseProjectIdParam,
  parseRequiredDisplayName,
  parseRuntimePolicyIdParam,
  parseSecretIdListField,
  readOptionalString,
  readRequiredString,
  requireRouteParam,
  requireUserActor,
  runtimeClientFor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiEnv } from "../../env.js";
import { parseOrganizationRouteParam } from "./parse-org-route-params.js";

export const runPoliciesRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

runPoliciesRoutes.post("/", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationId = parseOrganizationRouteParam(context);
    const body = parseJsonBody(await context.req.json());
    const operationIdRaw = readOptionalString(body, "operationId");
    const commandFingerprintRaw = readOptionalString(body, "commandFingerprint");

    return runtimeClientFor(context.env, userActor).createRuntimeInjectionPolicy({
      organizationId,
      projectId: parseProjectIdParam(readRequiredString(body, "projectId")),
      environmentId: parseEnvironmentIdParam(readRequiredString(body, "environmentId")),
      policyId: parseRuntimePolicyIdParam(readRequiredString(body, "policyId")),
      displayName: parseRequiredDisplayName(readRequiredString(body, "displayName")),
      command: readRequiredString(body, "command"),
      secretIds: parseSecretIdListField(body, "secretIds"),
      requestId: reqId,
      ...(commandFingerprintRaw !== undefined ? { commandFingerprint: commandFingerprintRaw } : {}),
      ...(operationIdRaw !== undefined
        ? { operationId: parseOperationIdParam(operationIdRaw) }
        : {}),
    });
  }),
);

runPoliciesRoutes.get("/:policyId", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationId = parseOrganizationRouteParam(context);
    const policyId = parseRuntimePolicyIdParam(
      requireRouteParam(context.req.param("policyId"), "policyId"),
    );

    return runtimeClientFor(context.env, userActor).getRuntimeInjectionPolicy({
      organizationId,
      policyId,
      requestId: reqId,
    });
  }),
);

runPoliciesRoutes.post("/:policyId/disable", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationId = parseOrganizationRouteParam(context);
    const policyId = parseRuntimePolicyIdParam(
      requireRouteParam(context.req.param("policyId"), "policyId"),
    );
    const body = parseJsonBody(await context.req.json());
    const operationIdRaw = readOptionalString(body, "operationId");

    return runtimeClientFor(context.env, userActor).disableRuntimeInjectionPolicy({
      organizationId,
      projectId: parseProjectIdParam(readRequiredString(body, "projectId")),
      environmentId: parseEnvironmentIdParam(readRequiredString(body, "environmentId")),
      policyId,
      comment: readRequiredString(body, "comment"),
      requestId: reqId,
      ...(operationIdRaw !== undefined
        ? { operationId: parseOperationIdParam(operationIdRaw) }
        : {}),
    });
  }),
);
