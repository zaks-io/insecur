import {
  agentSessionId,
  environmentId,
  organizationId,
  projectId,
  VALIDATION_ERROR_CODES,
} from "@insecur/domain";
import { parseRequestCredentials, readSessionCredentialMetadata } from "@insecur/auth";
import {
  handleRoute,
  requireUserActor,
  requireUserActorForWhoami,
  resolveInstanceId,
  resolveRequestUserActor,
  runtimeClientFor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono, type Context } from "hono";
import type { ApiApp, ApiEnv } from "../../env.js";

const sessionRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

type SessionRouteContext = Context<{ Bindings: ApiEnv; Variables: AuthVariables }>;

function optionalQueryParam(context: SessionRouteContext, name: string): string | undefined {
  const value = context.req.query(name);
  return value === undefined || value.trim() === "" ? undefined : value;
}

function parseOptionalAgentSessionId(raw: string) {
  const parsed = agentSessionId.parse(raw);
  if (!parsed.ok) {
    throw Object.assign(new Error("Invalid agent session id."), { code: parsed.code });
  }
  return parsed.value;
}

function parseOptionalOrganizationId(raw: string) {
  const parsed = organizationId.parse(raw);
  if (!parsed.ok) {
    throw Object.assign(new Error("Invalid organization id."), { code: parsed.code });
  }
  return parsed.value;
}

function parseOptionalProjectId(raw: string) {
  const parsed = projectId.parse(raw);
  if (!parsed.ok) {
    throw Object.assign(new Error("Invalid project id."), { code: parsed.code });
  }
  return parsed.value;
}

function parseOptionalEnvironmentId(raw: string) {
  const parsed = environmentId.parse(raw);
  if (!parsed.ok) {
    throw Object.assign(new Error("Invalid environment id."), { code: parsed.code });
  }
  return parsed.value;
}

function assertWhoamiContextScope(
  orgIdRaw: string | undefined,
  projectIdRaw: string | undefined,
  envIdRaw: string | undefined,
): void {
  if (envIdRaw !== undefined && projectIdRaw === undefined) {
    throw Object.assign(new Error("envId requires projectId."), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }
  if (projectIdRaw !== undefined && orgIdRaw === undefined) {
    throw Object.assign(new Error("projectId requires orgId."), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }
}

function parseWhoamiQueryParams(context: SessionRouteContext) {
  const orgIdRaw = optionalQueryParam(context, "orgId");
  const projectIdRaw = optionalQueryParam(context, "projectId");
  const envIdRaw = optionalQueryParam(context, "envId");
  const agentSessionIdRaw = optionalQueryParam(context, "agentSessionId");
  const agentTag = optionalQueryParam(context, "agentTag");
  const harnessName = optionalQueryParam(context, "harnessName");
  const ancestryKey = optionalQueryParam(context, "ancestryKey");

  assertWhoamiContextScope(orgIdRaw, projectIdRaw, envIdRaw);

  return {
    ...(orgIdRaw !== undefined ? { organizationId: parseOptionalOrganizationId(orgIdRaw) } : {}),
    ...(projectIdRaw !== undefined ? { projectId: parseOptionalProjectId(projectIdRaw) } : {}),
    ...(envIdRaw !== undefined ? { environmentId: parseOptionalEnvironmentId(envIdRaw) } : {}),
    ...(agentSessionIdRaw !== undefined
      ? { agentSessionId: parseOptionalAgentSessionId(agentSessionIdRaw) }
      : {}),
    ...(agentTag !== undefined ? { agentTag } : {}),
    ...(harnessName !== undefined ? { harnessName } : {}),
    ...(ancestryKey !== undefined ? { ancestryKey } : {}),
  };
}

sessionRoutes.get("/whoami", requireUserActorForWhoami, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const credentials = parseRequestCredentials({
      authorizationHeader: context.req.header("Authorization"),
      cookieHeader: null,
      csrfHeader: null,
    });
    const bearerCredential = credentials.bearerCredential;
    if (bearerCredential === undefined) {
      throw Object.assign(new Error("Authorization required."), { code: "auth.required" });
    }

    const sessionMetadata = await readSessionCredentialMetadata(
      bearerCredential,
      context.env.SESSION_SIGNING_SECRET,
    );
    const queryParams = parseWhoamiQueryParams(context);

    const runtimePayload = await runtimeClientFor(context.env, userActor).resolveSessionWhoami({
      requestId: reqId,
      sessionExpiresAt: sessionMetadata.expiresAt,
      agentMarked: sessionMetadata.agentMarked,
      ...(sessionMetadata.derivedAgentSessionId !== undefined
        ? { derivedAgentSessionId: sessionMetadata.derivedAgentSessionId }
        : {}),
      ...queryParams,
    });

    return {
      actorType: userActor.type,
      userId: userActor.userId,
      sessionId: userActor.sessionId,
      ...runtimePayload,
    };
  }),
);

// The console org-switcher memberships read (INS-367): a self-read forwarded over the private
// RUNTIME seam (ADR-0077). The public edge does zero DB I/O; the Runtime rebuilds the actor from
// the hop token and returns only that actor's own organizations.
sessionRoutes.get("/memberships", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    return runtimeClientFor(context.env, userActor).listSessionOrganizations({
      requestId: reqId,
    });
  }),
);

// Revokes only the calling actor's own CLI session (INS-436). Optional auth: unauthenticated
// callers get a metadata-only success no-op so `insecur logout` is idempotent without a session.
sessionRoutes.post("/revoke", async (context) =>
  handleRoute(context, async (reqId) => {
    const resolved = await resolveRequestUserActor({
      env: context.env,
      authorizationHeader: context.req.header("Authorization"),
      cookieHeader: null,
      csrfHeader: null,
    });
    if (!resolved.ok) {
      return { revoked: false };
    }
    const revoked = await runtimeClientFor(context.env, resolved.actor).revokeCliSession({
      instanceId: resolveInstanceId(context.env),
      requestId: reqId,
    });
    return { revoked: revoked.revoked };
  }),
);

export function registerSessionRoutes(app: ApiApp): void {
  app.route("/v1/session", sessionRoutes);
}
