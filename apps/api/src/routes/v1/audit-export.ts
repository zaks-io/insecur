import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import {
  handleRoute,
  parseOrganizationIdParam,
  requireUserActor,
  runtimeClientFor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono, type Context } from "hono";
import type { ApiEnv } from "../../env.js";
import { parseOrganizationRouteParam } from "./parse-org-route-params.js";

export const auditExportRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

type AuditExportRouteContext = Context<{ Bindings: ApiEnv; Variables: AuthVariables }>;

function requiredQueryParam(context: AuditExportRouteContext, name: string): string {
  const value = context.req.query(name);
  if (value === undefined || value.trim() === "") {
    throw Object.assign(new Error(`Missing required query parameter: ${name}`), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }
  return value;
}

function parseIsoTimestamp(raw: string, label: string): string {
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    throw Object.assign(new Error(`Invalid audit export ${label} timestamp.`), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }
  return new Date(parsed).toISOString();
}

// Org audit export (INS-440). Authorize-then-export runs in the Runtime deploy (ADR-0077): the public
// edge performs zero DB I/O and forwards a scoped hop token only; signing keys stay Runtime-custodied.
auditExportRoutes.get("/", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationId = parseOrganizationIdParam(parseOrganizationRouteParam(context));
    const from = parseIsoTimestamp(requiredQueryParam(context, "from"), "from");
    const to = parseIsoTimestamp(requiredQueryParam(context, "to"), "to");

    if (from > to) {
      throw Object.assign(new Error("Audit export from must be before or equal to to."), {
        code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
      });
    }

    return runtimeClientFor(context.env, userActor).exportTenantAudit({
      organizationId,
      requestId: reqId,
      from,
      to,
    });
  }),
);
