import {
  handleDeliveryRoute,
  handleRoute,
  parseEnvironmentIdParam,
  parseInjectionGrantConsumeSelector,
  parseInjectionGrantIssueSelector,
  parseJsonBody,
  parseProjectIdParam,
  readRequiredString,
  runtimeClientFor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { parseChildExitCode } from "@insecur/domain";
import { Hono } from "hono";
import type { ApiApp, ApiEnv } from "../../env.js";
import {
  requireRuntimeInjectionActor,
  type RuntimeInjectionActorVariables,
} from "../../runtime-injection-actor.js";
import {
  parseOrganizationAndGrantRouteParams,
  parseOrganizationRouteParam,
} from "./parse-org-route-params.js";

const runtimeInjectionRoutes = new Hono<{
  Bindings: ApiEnv;
  Variables: AuthVariables & RuntimeInjectionActorVariables;
}>();

runtimeInjectionRoutes.post("/grants", requireRuntimeInjectionActor, async (context) => {
  return handleRoute(context, async (reqId) => {
    const requestActor = context.get("requestActor");
    const organizationId = parseOrganizationRouteParam(context);
    const body = parseJsonBody(await context.req.json());
    const projectId = parseProjectIdParam(readRequiredString(body, "projectId"));
    const environmentId = parseEnvironmentIdParam(readRequiredString(body, "environmentId"));
    const selector = parseInjectionGrantIssueSelector(body);

    return runtimeClientFor(context.env, requestActor).issueInjectionGrant({
      organizationId,
      projectId,
      environmentId,
      selector,
      requestId: reqId,
    });
  });
});

runtimeInjectionRoutes.post(
  "/grants/:grantId/consume",
  requireRuntimeInjectionActor,
  async (context) => {
    return handleDeliveryRoute(context, async (reqId) => {
      const requestActor = context.get("requestActor");
      const { organizationId, grantId } = parseOrganizationAndGrantRouteParams(context);
      const body = parseJsonBody(await context.req.json());
      const selector = parseInjectionGrantConsumeSelector(body);

      const envelope = await runtimeClientFor(context.env, requestActor).consumeGrant({
        organizationId,
        grantId,
        requestId: reqId,
        ...(selector.kind === "variable_key"
          ? { variableKey: selector.variableKey }
          : { secretId: selector.secretId }),
      });

      return context.json(envelope);
    });
  },
);

runtimeInjectionRoutes.post(
  "/grants/:grantId/consume-all",
  requireRuntimeInjectionActor,
  async (context) => {
    return handleDeliveryRoute(context, async (reqId) => {
      const requestActor = context.get("requestActor");
      const { organizationId, grantId } = parseOrganizationAndGrantRouteParams(context);

      const envelope = await runtimeClientFor(context.env, requestActor).consumeGrantAll({
        organizationId,
        grantId,
        requestId: reqId,
      });

      return context.json(envelope);
    });
  },
);

runtimeInjectionRoutes.post(
  "/grants/:grantId/run-completed",
  requireRuntimeInjectionActor,
  async (context) => {
    return handleRoute(context, async (reqId) => {
      const requestActor = context.get("requestActor");
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

      return runtimeClientFor(context.env, requestActor).recordInjectionRunCompleted({
        organizationId,
        grantId,
        childExitCode: parsedChildExitCode.value,
        requestId: reqId,
      });
    });
  },
);

export function registerRuntimeInjectionRoutes(app: ApiApp): void {
  app.route("/v1/orgs/:organizationId/runtime-injection", runtimeInjectionRoutes);
}
