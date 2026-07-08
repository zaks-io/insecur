import { machineIdentityId, VALIDATION_ERROR_CODES } from "@insecur/domain";
import {
  handleRoute,
  parseEnvironmentIdParam,
  parseOrganizationIdParam,
  parseProjectIdParam,
  parseUserIdField,
  requireUserActor,
  runtimeClientFor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono, type Context } from "hono";
import type { ApiApp, ApiEnv } from "../../env.js";
import { parseOrganizationRouteParam } from "./parse-org-route-params.js";

const auditEventsRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

type AuditEventsRouteContext = Context<{ Bindings: ApiEnv; Variables: AuthVariables }>;

const AUDIT_EVENTS_MAX_PAGE_SIZE = 100;

function optionalQueryParam(context: AuditEventsRouteContext, name: string): string | undefined {
  const value = context.req.query(name);
  return value === undefined || value.trim() === "" ? undefined : value;
}

function parseOptionalMachineIdentityId(raw: string) {
  const parsed = machineIdentityId.parse(raw);
  if (!parsed.ok) {
    throw Object.assign(new Error("Invalid machine identity id."), { code: parsed.code });
  }
  return parsed.value;
}

function parseOptionalPageSize(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const pageSize = Number(raw);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > AUDIT_EVENTS_MAX_PAGE_SIZE) {
    throw Object.assign(new Error("Invalid audit events page size."), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }
  return pageSize;
}

function parseAuditEventFilters(context: AuditEventsRouteContext) {
  const actorUserIdRaw = optionalQueryParam(context, "actorUserId");
  const actorMachineIdentityIdRaw = optionalQueryParam(context, "actorMachineIdentityId");
  const projectIdRaw = optionalQueryParam(context, "projectId");
  const environmentIdRaw = optionalQueryParam(context, "environmentId");
  const eventCode = optionalQueryParam(context, "eventCode");
  const createdAtFrom = optionalQueryParam(context, "createdAtFrom");
  const createdAtTo = optionalQueryParam(context, "createdAtTo");

  return {
    ...(actorUserIdRaw !== undefined ? { actorUserId: parseUserIdField(actorUserIdRaw) } : {}),
    ...(actorMachineIdentityIdRaw !== undefined
      ? { actorMachineIdentityId: parseOptionalMachineIdentityId(actorMachineIdentityIdRaw) }
      : {}),
    ...(projectIdRaw !== undefined ? { projectId: parseProjectIdParam(projectIdRaw) } : {}),
    ...(environmentIdRaw !== undefined
      ? { environmentId: parseEnvironmentIdParam(environmentIdRaw) }
      : {}),
    ...(eventCode !== undefined ? { eventCode } : {}),
    ...(createdAtFrom !== undefined ? { createdAtFrom } : {}),
    ...(createdAtTo !== undefined ? { createdAtTo } : {}),
  };
}

function parseAuditEventsQuery(context: AuditEventsRouteContext) {
  const filters = parseAuditEventFilters(context);
  const pageSize = parseOptionalPageSize(optionalQueryParam(context, "pageSize"));
  const cursor = optionalQueryParam(context, "cursor");

  return {
    ...(Object.keys(filters).length > 0 ? { filters } : {}),
    ...(pageSize !== undefined ? { pageSize } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
  };
}

// Org audit trail read (INS-364). Authorize-then-read runs atomically in the Runtime deploy
// (ADR-0077): the public edge performs zero DB I/O and forwards a scoped hop token only.
auditEventsRoutes.get("/", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationId = parseOrganizationIdParam(parseOrganizationRouteParam(context));
    const query = parseAuditEventsQuery(context);

    return runtimeClientFor(context.env, userActor).listAuditEvents({
      organizationId,
      requestId: reqId,
      ...query,
    });
  }),
);

export function registerAuditEventsRoutes(app: ApiApp): void {
  app.route("/v1/orgs/:organizationId/audit-events", auditEventsRoutes);
}
