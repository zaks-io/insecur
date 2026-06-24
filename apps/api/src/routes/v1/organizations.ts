import { createOperatorOrganization } from "@insecur/onboarding";
import type { OperatorOrganizationResourceIds } from "@insecur/onboarding";
import { organizationId, teamId, VALIDATION_ERROR_CODES } from "@insecur/domain";
import {
  handleRoute,
  parseJsonBody,
  parseOptionalDisplayName,
  parseOrganizationIdParam,
  readOptionalString,
  readRequiredString,
  requireRouteParam,
  requireUserActor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiEnv } from "../../env.js";

export const organizationsRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

function instanceIdFromEnv(env: ApiEnv): string {
  return env.INSTANCE_ID ?? "inst_LOCAL_DEV";
}

function parseOperatorOrganizationResourceIds(
  body: Record<string, unknown>,
): OperatorOrganizationResourceIds | undefined {
  const raw = body.resourceIds;
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw Object.assign(new Error("Invalid resourceIds."), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }
  const record = raw as Record<string, unknown>;
  const parsedOrganizationId = organizationId.parse(readRequiredString(record, "organizationId"));
  if (!parsedOrganizationId.ok) {
    throw Object.assign(new Error("Invalid resourceIds."), { code: parsedOrganizationId.code });
  }
  const parsedTeamId = teamId.parse(readRequiredString(record, "defaultTeamId"));
  if (!parsedTeamId.ok) {
    throw Object.assign(new Error("Invalid resourceIds."), { code: parsedTeamId.code });
  }
  return {
    organizationId: parsedOrganizationId.value,
    defaultTeamId: parsedTeamId.value,
  };
}

organizationsRoutes.post("/", requireUserActor, async (context) => {
  return handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    parseOrganizationIdParam(
      requireRouteParam(context.req.param("organizationId"), "organizationId"),
    );
    const body = parseJsonBody(await context.req.json());
    const organizationDisplayName = parseOptionalDisplayName(
      readOptionalString(body, "organizationDisplayName"),
    );
    const teamDisplayName = parseOptionalDisplayName(readOptionalString(body, "teamDisplayName"));
    const resourceIds = parseOperatorOrganizationResourceIds(body);

    return createOperatorOrganization({
      instanceId: instanceIdFromEnv(context.env),
      operatorUserId: userActor.userId,
      ...(organizationDisplayName !== undefined ? { organizationDisplayName } : {}),
      ...(teamDisplayName !== undefined ? { teamDisplayName } : {}),
      ...(resourceIds !== undefined ? { resourceIds } : {}),
      request: { requestId: reqId },
    });
  });
});
