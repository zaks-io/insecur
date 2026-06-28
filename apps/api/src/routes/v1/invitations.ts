import { acceptInvitation, createInvitation } from "@insecur/onboarding";
import {
  handleRoute,
  parseInvitationIdParam,
  parseJsonBody,
  parseOrganizationIdParam,
  parseOptionalInvitationId,
  parseOptionalMembershipId,
  parseProjectIdParam,
  parseUserIdField,
  readOptionalString,
  readRequiredString,
  requireRouteParam,
  requireUserActor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiEnv } from "../../env.js";

export const invitationsRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

invitationsRoutes.post("/", requireUserActor, async (context) => {
  return handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationIdParam = requireRouteParam(
      context.req.param("organizationId"),
      "organizationId",
    );
    const organizationId = parseOrganizationIdParam(organizationIdParam);
    const body = parseJsonBody(await context.req.json());
    const projectIdRaw = readOptionalString(body, "projectId");
    const invitationIdValue = parseOptionalInvitationId(readOptionalString(body, "invitationId"));
    const membershipIdValue = parseOptionalMembershipId(readOptionalString(body, "membershipId"));

    return createInvitation({
      actor: { type: "user", userId: userActor.userId },
      organizationId,
      inviteeUserId: parseUserIdField(readRequiredString(body, "inviteeUserId")),
      rolePreset: readRequiredString(body, "rolePreset"),
      ...(projectIdRaw !== undefined ? { projectId: parseProjectIdParam(projectIdRaw) } : {}),
      ...(invitationIdValue !== undefined ? { invitationId: invitationIdValue } : {}),
      ...(membershipIdValue !== undefined ? { membershipId: membershipIdValue } : {}),
      request: { requestId: reqId },
    });
  });
});

invitationsRoutes.post("/:invitationId/accept", requireUserActor, async (context) => {
  return handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationId = parseOrganizationIdParam(
      requireRouteParam(context.req.param("organizationId"), "organizationId"),
    );
    const invitationIdValue = parseInvitationIdParam(
      requireRouteParam(context.req.param("invitationId"), "invitationId"),
    );
    const body = parseJsonBody(await context.req.json());
    const membershipIdValue = parseOptionalMembershipId(readOptionalString(body, "membershipId"));

    return acceptInvitation({
      invitationId: invitationIdValue,
      organizationId,
      acceptingUserId: userActor.userId,
      ...(membershipIdValue !== undefined ? { membershipId: membershipIdValue } : {}),
      request: { requestId: reqId },
    });
  });
});
