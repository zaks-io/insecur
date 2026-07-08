import {
  encodeRequestValueUtf8,
  handleRoute,
  parseAppConnectionIdParam,
  parseOperationIdParam,
  parseRequiredDisplayName,
  readOptionalBoolean,
  readOptionalString,
  readRequiredString,
  requireUserActor,
  resolveInstanceId,
  runtimeClientFor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiApp, ApiEnv } from "../../env.js";
import { parseOrganizationAndAppConnectionRouteParams } from "./parse-connection-route-params.js";
import { parseOrganizationRouteParam } from "./parse-org-route-params.js";
import { parseOrgScopedMutationBody } from "./parse-org-scoped-mutation-body.js";

const connectionsRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

function readOptionalStringArray(
  body: Record<string, unknown>,
  field: string,
): readonly string[] | undefined {
  const value = body[field];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw Object.assign(new Error(`Invalid field: ${field}.`), {
      code: "validation.invalid_opaque_resource_id",
    });
  }
  return value;
}

function readOptionalTokenUtf8(body: Record<string, unknown>): Uint8Array | undefined {
  const tokenUtf8 = readOptionalString(body, "tokenUtf8");
  return tokenUtf8 === undefined ? undefined : encodeRequestValueUtf8(tokenUtf8);
}

function readOptionalGitHubBoundary(body: Record<string, unknown>) {
  const installationId = readOptionalString(body, "installationId");
  const owner = readOptionalString(body, "owner");
  const allowedRepositories = readOptionalStringArray(body, "allowedRepositories");
  if (installationId === undefined || owner === undefined || allowedRepositories === undefined) {
    return undefined;
  }
  return { installationId, owner, allowedRepositories };
}

const GITHUB_BOUNDARY_OVERRIDE_MESSAGE =
  "GitHub boundary override requires installationId, owner, and allowedRepositories.";

function readGitHubBoundaryOverride(body: Record<string, unknown>) {
  const installationId = readOptionalString(body, "installationId");
  const owner = readOptionalString(body, "owner");
  const allowedRepositories = readOptionalStringArray(body, "allowedRepositories");
  const fieldsPresent = [
    installationId !== undefined,
    owner !== undefined,
    allowedRepositories !== undefined,
  ].filter(Boolean).length;

  if (fieldsPresent === 0) {
    return undefined;
  }
  if (installationId !== undefined && owner !== undefined && allowedRepositories !== undefined) {
    return { installationId, owner, allowedRepositories };
  }

  throw Object.assign(new Error(GITHUB_BOUNDARY_OVERRIDE_MESSAGE), {
    code: "validation.invalid_command_input",
    retryable: false,
  });
}

connectionsRoutes.get("/", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationId = parseOrganizationRouteParam(context);

    return runtimeClientFor(context.env, userActor).listAppConnections({
      organizationId,
      requestId: reqId,
    });
  }),
);

connectionsRoutes.post("/", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const { userActor, organizationId, body, operationIdRaw } =
      await parseOrgScopedMutationBody(context);
    const tokenUtf8 = readOptionalTokenUtf8(body);
    const allowAccountId = readOptionalString(body, "allowAccountId");
    const allowWorkerScript = readOptionalString(body, "allowWorkerScript");
    const githubBoundary = readOptionalGitHubBoundary(body);

    return runtimeClientFor(context.env, userActor).createAppConnection({
      organizationId,
      instanceId: resolveInstanceId(context.env),
      appConnectionId: parseAppConnectionIdParam(readRequiredString(body, "appConnectionId")),
      provider: readRequiredString(body, "provider"),
      connectionMethod: readRequiredString(body, "connectionMethod"),
      displayName: parseRequiredDisplayName(readRequiredString(body, "displayName")),
      requestId: reqId,
      ...(operationIdRaw !== undefined
        ? { operationId: parseOperationIdParam(operationIdRaw) }
        : {}),
      ...(tokenUtf8 !== undefined ? { tokenUtf8 } : {}),
      ...(allowAccountId !== undefined && allowWorkerScript !== undefined
        ? {
            cloudflareBoundary: {
              allowedAccountId: allowAccountId,
              allowedWorkerScript: allowWorkerScript,
            },
          }
        : {}),
      ...(githubBoundary === undefined ? {} : { githubBoundary }),
    });
  }),
);

connectionsRoutes.get("/:connectionId", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const { organizationId, appConnectionId } =
      parseOrganizationAndAppConnectionRouteParams(context);

    return runtimeClientFor(context.env, userActor).getAppConnectionStatus({
      organizationId,
      appConnectionId,
      requestId: reqId,
    });
  }),
);

connectionsRoutes.post("/:connectionId/reauth", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const { userActor, organizationId, body, operationIdRaw } =
      await parseOrgScopedMutationBody(context);
    const { appConnectionId } = parseOrganizationAndAppConnectionRouteParams(context);
    const githubBoundary = readGitHubBoundaryOverride(body);

    return runtimeClientFor(context.env, userActor).reauthAppConnection({
      organizationId,
      appConnectionId,
      requestId: reqId,
      ...(operationIdRaw !== undefined
        ? { operationId: parseOperationIdParam(operationIdRaw) }
        : {}),
      ...(githubBoundary === undefined ? {} : { githubBoundary }),
    });
  }),
);

connectionsRoutes.post("/:connectionId/rotate", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const { userActor, organizationId, body, operationIdRaw } =
      await parseOrgScopedMutationBody(context);
    const { appConnectionId } = parseOrganizationAndAppConnectionRouteParams(context);
    const dryRun = readOptionalBoolean(body, "dryRun") ?? false;
    const tokenUtf8 = readOptionalTokenUtf8(body);

    return runtimeClientFor(context.env, userActor).rotateAppConnectionCredential({
      organizationId,
      appConnectionId,
      requestId: reqId,
      dryRun,
      ...(operationIdRaw !== undefined
        ? { operationId: parseOperationIdParam(operationIdRaw) }
        : {}),
      ...(tokenUtf8 !== undefined ? { tokenUtf8 } : {}),
    });
  }),
);

connectionsRoutes.post("/:connectionId/disconnect", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const { organizationId, appConnectionId } =
      parseOrganizationAndAppConnectionRouteParams(context);

    return runtimeClientFor(context.env, userActor).disconnectAppConnection({
      organizationId,
      appConnectionId,
      requestId: reqId,
    });
  }),
);

export function registerConnectionsRoutes(app: ApiApp): void {
  app.route("/v1/orgs/:organizationId/connections", connectionsRoutes);
}
