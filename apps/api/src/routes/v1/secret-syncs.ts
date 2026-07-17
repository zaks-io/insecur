import {
  parseJsonBody,
  parseOptionalDisplayName,
  parseRequestIdParam,
  parseRequiredDisplayName,
  parseSecretSyncIdParam,
  readOptionalBoolean,
  readOptionalString,
  readRequiredString,
  requireRouteParam,
  requireUserActor,
  runtimeClientFor,
  type AuthVariables,
  type SecretSyncBindingRpcInput,
  type SecretSyncCloudflareTargetRpcInput,
  type SecretSyncGitHubTargetRpcInput,
} from "@insecur/worker-kit";
import { parseAppConnectionIdParam } from "@insecur/worker-kit";
import {
  SECRET_SYNC_MAPPING_BEHAVIORS,
  VALIDATION_ERROR_CODES,
  type GitHubActionsProviderScope,
  type SecretSyncMappingBehavior,
} from "@insecur/domain";
import { Hono } from "hono";
import type { ApiApp, ApiEnv } from "../../env.js";
import { handleEnvironmentScopedUserRoute } from "./handle-environment-scoped-user-route.js";

const secretSyncRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

function invalidInput(message: string): never {
  throw Object.assign(new Error(message), {
    code: VALIDATION_ERROR_CODES.invalidCommandInput,
  });
}

/**
 * Bindings are forwarded as opaque strings; the Runtime command rejects pattern selectors and
 * non-exact ids (INS-77). The edge only enforces the JSON shape.
 */
function readBindings(
  body: Record<string, unknown>,
  required: boolean,
): readonly SecretSyncBindingRpcInput[] | undefined {
  const value = body.bindings;
  if (value === undefined) {
    if (required) {
      invalidInput("bindings is required.");
    }
    return undefined;
  }
  if (!Array.isArray(value)) {
    invalidInput("bindings must be an array.");
  }
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null) {
      invalidInput("bindings entries must be objects.");
    }
    const binding = entry as Record<string, unknown>;
    return {
      secretId: readRequiredString(binding, "secretId"),
      providerDestination: readRequiredString(binding, "providerDestination"),
    };
  });
}

function readGithubTarget(
  body: Record<string, unknown>,
): SecretSyncGitHubTargetRpcInput | undefined {
  const value = body.githubTarget;
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null) {
    invalidInput("githubTarget must be an object.");
  }
  const target = value as Record<string, unknown>;
  const targetGithubEnvironmentId = readOptionalString(target, "targetGithubEnvironmentId");
  return {
    targetRepoId: readRequiredString(target, "targetRepoId"),
    // The Runtime command validates the scope value; the cast only carries the raw string across
    // the typed seam.
    githubProviderScope: readRequiredString(
      target,
      "githubProviderScope",
    ) as GitHubActionsProviderScope,
    ...(targetGithubEnvironmentId === undefined ? {} : { targetGithubEnvironmentId }),
  };
}

function readCloudflareTarget(
  body: Record<string, unknown>,
): SecretSyncCloudflareTargetRpcInput | undefined {
  const value = body.cloudflareTarget;
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null) {
    invalidInput("cloudflareTarget must be an object.");
  }
  return {
    workerScriptName: readRequiredString(value as Record<string, unknown>, "workerScriptName"),
  };
}

function readMappingBehavior(body: Record<string, unknown>): SecretSyncMappingBehavior | undefined {
  const raw = readOptionalString(body, "mappingBehavior");
  if (raw === undefined) {
    return undefined;
  }
  const behavior = Object.values(SECRET_SYNC_MAPPING_BEHAVIORS).find((value) => value === raw);
  if (behavior === undefined) {
    invalidInput("Invalid mappingBehavior.");
  }
  return behavior;
}

/**
 * `protectedChangeId` is a reference to server-side approval evidence, parsed and forwarded only.
 * No fingerprint or approval material is ever accepted from the client (INS-608); the Runtime
 * enforcement seam recomputes the delivery-target match from its own stored evidence.
 */
function readProtectedChangeId(body: Record<string, unknown>) {
  const raw = readOptionalString(body, "protectedChangeId");
  return raw === undefined ? undefined : parseRequestIdParam(raw);
}

secretSyncRoutes.post("/", requireUserActor, async (context) =>
  handleEnvironmentScopedUserRoute(context, async (scope) => {
    const body = parseJsonBody(await context.req.json());
    const githubTarget = readGithubTarget(body);
    const cloudflareTarget = readCloudflareTarget(body);
    const mappingBehavior = readMappingBehavior(body);
    const autoSyncEnabled = readOptionalBoolean(body, "autoSyncEnabled");
    const protectedChangeId = readProtectedChangeId(body);
    const bindings = readBindings(body, true);
    if (bindings === undefined) {
      invalidInput("bindings is required.");
    }

    return runtimeClientFor(context.env, scope.userActor).createSecretSync({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      environmentId: scope.environmentId,
      appConnectionId: parseAppConnectionIdParam(readRequiredString(body, "appConnectionId")),
      displayName: parseRequiredDisplayName(readRequiredString(body, "displayName")),
      kind: readRequiredString(body, "kind"),
      bindings,
      requestId: scope.requestId,
      ...(mappingBehavior !== undefined ? { mappingBehavior } : {}),
      ...(autoSyncEnabled !== undefined ? { autoSyncEnabled } : {}),
      ...(githubTarget !== undefined ? { githubTarget } : {}),
      ...(cloudflareTarget !== undefined ? { cloudflareTarget } : {}),
      ...(protectedChangeId !== undefined ? { protectedChangeId } : {}),
    });
  }),
);

secretSyncRoutes.patch("/:secretSyncId", requireUserActor, async (context) =>
  handleEnvironmentScopedUserRoute(context, async (scope) => {
    const secretSyncId = parseSecretSyncIdParam(
      requireRouteParam(context.req.param("secretSyncId"), "secretSyncId"),
    );
    const body = parseJsonBody(await context.req.json());
    const displayName = parseOptionalDisplayName(readOptionalString(body, "displayName"));
    const githubTarget = readGithubTarget(body);
    const cloudflareTarget = readCloudflareTarget(body);
    const mappingBehavior = readMappingBehavior(body);
    const autoSyncEnabled = readOptionalBoolean(body, "autoSyncEnabled");
    const protectedChangeId = readProtectedChangeId(body);
    const bindings = readBindings(body, false);

    return runtimeClientFor(context.env, scope.userActor).updateSecretSync({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      environmentId: scope.environmentId,
      secretSyncId,
      requestId: scope.requestId,
      ...(displayName !== undefined ? { displayName } : {}),
      ...(mappingBehavior !== undefined ? { mappingBehavior } : {}),
      ...(autoSyncEnabled !== undefined ? { autoSyncEnabled } : {}),
      ...(bindings !== undefined ? { bindings } : {}),
      ...(githubTarget !== undefined ? { githubTarget } : {}),
      ...(cloudflareTarget !== undefined ? { cloudflareTarget } : {}),
      ...(protectedChangeId !== undefined ? { protectedChangeId } : {}),
    });
  }),
);

/**
 * Inline Sync Execution (ADR-0057): the edge parses and forwards only. The
 * Operation Store lease, Sync Execution Revalidation, decrypt, and provider
 * writes all run inside the Runtime deploy; the response is metadata-only
 * operation status. Execution-phase failures come back as Operation state
 * plus a stable `resultCode`, not as HTTP errors.
 */
secretSyncRoutes.post("/:secretSyncId/run", requireUserActor, async (context) =>
  handleEnvironmentScopedUserRoute(context, async (scope) => {
    const secretSyncId = parseSecretSyncIdParam(
      requireRouteParam(context.req.param("secretSyncId"), "secretSyncId"),
    );
    const body = parseJsonBody(await context.req.json());
    const idempotencyKey = readOptionalString(body, "idempotencyKey");
    const expectedPlanFingerprint = readOptionalString(body, "expectedPlanFingerprint");
    const protectedChangeId = readProtectedChangeId(body);

    return runtimeClientFor(context.env, scope.userActor).runSecretSync({
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      environmentId: scope.environmentId,
      secretSyncId,
      requestId: scope.requestId,
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
      ...(expectedPlanFingerprint !== undefined ? { expectedPlanFingerprint } : {}),
      ...(protectedChangeId !== undefined ? { protectedChangeId } : {}),
    });
  }),
);

export function registerSecretSyncRoutes(app: ApiApp): void {
  app.route(
    "/v1/orgs/:organizationId/projects/:projectId/environments/:environmentId/secret-syncs",
    secretSyncRoutes,
  );
}
