import {
  assertSafeSecretValueIngress,
  rejectNamedLocalValueFile,
} from "@insecur/secret-store-contracts";
import {
  handleRoute,
  parseEnvironmentIdParam,
  parseJsonBody,
  parseOrganizationIdParam,
  parseProjectIdParam,
  parseRequiredDisplayName,
  parseSecretIdParam,
  readOptionalString,
  readRequiredString,
  requireRouteParam,
  requireUserActor,
  runtimeClientFor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { Context } from "hono";
import type { RequestId } from "@insecur/domain";
import type { ApiApp, ApiEnv } from "../../env.js";
import { parseSecretWriteBody } from "./parse-secret-write-body.js";
import { handleEnvironmentScopedUserRoute } from "./handle-environment-scoped-user-route.js";

const projectsRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

function parseProjectScopedRouteParams(
  context: Context<{ Bindings: ApiEnv; Variables: AuthVariables }>,
) {
  return {
    organizationId: parseOrganizationIdParam(
      requireRouteParam(context.req.param("organizationId"), "organizationId"),
    ),
    projectId: parseProjectIdParam(requireRouteParam(context.req.param("projectId"), "projectId")),
  };
}

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

  return runtimeClientFor(context.env, userActor).writeSecret({
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

// Authorize-then-read runs atomically in the Runtime deploy (ADR-0077): the public edge performs
// zero DB I/O and forwards scoped hop tokens only.
projectsRoutes.get("/", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationId = parseOrganizationIdParam(
      requireRouteParam(context.req.param("organizationId"), "organizationId"),
    );

    return runtimeClientFor(context.env, userActor).listProjects({
      organizationId,
      requestId: reqId,
    });
  }),
);

projectsRoutes.post("/", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationId = parseOrganizationIdParam(
      requireRouteParam(context.req.param("organizationId"), "organizationId"),
    );
    const body = parseJsonBody(await context.req.json());

    return runtimeClientFor(context.env, userActor).createProject({
      organizationId,
      projectId: parseProjectIdParam(readRequiredString(body, "projectId")),
      displayName: parseRequiredDisplayName(readRequiredString(body, "displayName")),
      requestId: reqId,
    });
  }),
);

projectsRoutes.get("/:projectId/environments", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const { organizationId, projectId } = parseProjectScopedRouteParams(context);

    return runtimeClientFor(context.env, userActor).listEnvironments({
      organizationId,
      projectId,
      requestId: reqId,
    });
  }),
);

projectsRoutes.post("/:projectId/environments", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const { organizationId, projectId } = parseProjectScopedRouteParams(context);
    const body = parseJsonBody(await context.req.json());
    const copyShapesFromRaw = readOptionalString(body, "copyShapesFromEnvironmentId");

    return runtimeClientFor(context.env, userActor).createEnvironment({
      organizationId,
      projectId,
      environmentId: parseEnvironmentIdParam(readRequiredString(body, "environmentId")),
      displayName: parseRequiredDisplayName(readRequiredString(body, "displayName")),
      ...(copyShapesFromRaw !== undefined
        ? { copyShapesFromEnvironmentId: parseEnvironmentIdParam(copyShapesFromRaw) }
        : {}),
      requestId: reqId,
    });
  }),
);

projectsRoutes.get("/:projectId/secrets", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const { organizationId, projectId } = parseProjectScopedRouteParams(context);

    return runtimeClientFor(context.env, userActor).listProjectSecrets({
      organizationId,
      projectId,
      requestId: reqId,
    });
  }),
);

projectsRoutes.get(
  "/:projectId/environments/:environmentId/secrets",
  requireUserActor,
  async (context) =>
    handleEnvironmentScopedUserRoute(context, (scope) =>
      runtimeClientFor(context.env, scope.userActor).listEnvironmentSecrets({
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        environmentId: scope.environmentId,
        requestId: scope.requestId,
      }),
    ),
);

projectsRoutes.get(
  "/:projectId/environments/:environmentId/secrets/:secretId/versions",
  requireUserActor,
  async (context) =>
    handleEnvironmentScopedUserRoute(context, (scope) => {
      const secretId = parseSecretIdParam(
        requireRouteParam(context.req.param("secretId"), "secretId"),
      );

      return runtimeClientFor(context.env, scope.userActor).listSecretVersions({
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        environmentId: scope.environmentId,
        secretId,
        requestId: scope.requestId,
      });
    }),
);

projectsRoutes.post(
  "/:projectId/environments/:environmentId/secrets/by-variable-key",
  requireUserActor,
  async (context) =>
    handleRoute(context, (reqId) => executeSecretWriteByVariableKey(context, reqId)),
);

export function registerProjectsRoutes(app: ApiApp): void {
  app.route("/v1/orgs/:organizationId/projects", projectsRoutes);
}
