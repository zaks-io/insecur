import {
  agentSessionId,
  environmentId,
  organizationId,
  projectId,
  successEnvelope,
  VALIDATION_ERROR_CODES,
} from "@insecur/domain";
import {
  INSECUR_SESSION_CREDENTIAL_HEADER,
  mintDerivedAgentSessionCredential,
} from "@insecur/auth";
import {
  createRequestId,
  domainErrorEnvelope,
  handleRoute,
  requireUserActor,
  requireUserActorForWhoami,
  resolveInstanceId,
  resolveRequestUserActor,
  runtimeClientFor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiApp, ApiEnv } from "../../env.js";
import {
  mergeWhoamiAttributionQueryParams,
  parseOptionalDeriveHarnessName,
  readHumanSessionMetadata,
  readRequestSessionMetadata,
} from "./session-route-helpers.js";

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

function parseRegisterAgentBody(
  body: unknown,
):
  | { readonly ok: true; readonly harnessName: string; readonly ancestryKey: string }
  | { readonly ok: false } {
  if (body === null || typeof body !== "object") {
    return { ok: false };
  }
  const record = body as Record<string, unknown>;
  const harnessName = typeof record.harnessName === "string" ? record.harnessName.trim() : "";
  const ancestryKey = typeof record.ancestryKey === "string" ? record.ancestryKey.trim() : "";
  if (harnessName === "" || ancestryKey === "") {
    return { ok: false };
  }
  return { ok: true, harnessName, ancestryKey };
}

sessionRoutes.get("/whoami", requireUserActorForWhoami, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const sessionMetadata = await readRequestSessionMetadata(context);
    const queryParams = parseWhoamiQueryParams(context);
    const attributionParams = mergeWhoamiAttributionQueryParams(sessionMetadata, queryParams);

    const runtimePayload = await runtimeClientFor(context.env, userActor).resolveSessionWhoami({
      requestId: reqId,
      sessionExpiresAt: sessionMetadata.expiresAt,
      agentMarked: sessionMetadata.agentMarked,
      ...(sessionMetadata.derivedAgentSessionId !== undefined
        ? { derivedAgentSessionId: sessionMetadata.derivedAgentSessionId }
        : {}),
      ...attributionParams,
    });

    return {
      actorType: userActor.type,
      userId: userActor.userId,
      sessionId: userActor.sessionId,
      ...runtimePayload,
    };
  }),
);

sessionRoutes.post("/agent/derive", requireUserActor, async (context) => {
  const reqId = createRequestId();
  try {
    const userActor = context.get("userActor");
    const parentSession = await readHumanSessionMetadata(context);
    const body: unknown = await context.req.json().catch(() => ({}));
    const harnessName = parseOptionalDeriveHarnessName(body);
    const minted = await mintDerivedAgentSessionCredential({
      actor: userActor,
      signingSecret: context.env.SESSION_SIGNING_SECRET,
      parentExpiresAt: parentSession.expiresAt,
      ...(harnessName === undefined ? {} : { harnessName }),
    });
    return context.json(
      successEnvelope(
        {
          sessionId: userActor.sessionId,
          expiresAt: minted.expiresAt,
          agentSessionId: minted.agentSessionId,
        },
        { requestId: reqId },
      ),
      200,
      { [INSECUR_SESSION_CREDENTIAL_HEADER]: minted.credential },
    );
  } catch (error) {
    const { status, body } = domainErrorEnvelope(error, reqId);
    return context.json(body, status as ContentfulStatusCode);
  }
});

sessionRoutes.post("/agent/register", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    await readHumanSessionMetadata(context);
    const parsed = parseRegisterAgentBody(await context.req.json().catch(() => null));
    if (!parsed.ok) {
      throw Object.assign(new Error("harnessName and ancestryKey are required."), {
        code: VALIDATION_ERROR_CODES.invalidCommandInput,
      });
    }
    return runtimeClientFor(context.env, userActor).registerAgentSession({
      requestId: reqId,
      harnessName: parsed.harnessName,
      ancestryKey: parsed.ancestryKey,
    });
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
