import { acceptInvitation, createInvitation } from "@insecur/onboarding";
import {
  invitationId,
  membershipId,
  userId,
  type InvitationId,
  type MembershipId,
  type UserId,
} from "@insecur/domain";
import {
  handleRoute,
  parseJsonBody,
  parseOrganizationIdParam,
  parseProjectIdParam,
  readOptionalString,
  readRequiredString,
  requireRouteParam,
  requireUserActor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiEnv } from "../../env.js";

export const invitationsRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

function parseInvitationIdParam(raw: string): InvitationId {
  const parsed = invitationId.parse(raw);
  if (!parsed.ok) {
    throw Object.assign(new Error("Invalid invitation id."), { code: parsed.code });
  }
  return parsed.value;
}

function parseUserIdField(raw: string): UserId {
  const parsed = userId.parse(raw);
  if (!parsed.ok) {
    throw Object.assign(new Error("Invalid user id."), { code: parsed.code });
  }
  return parsed.value;
}

function parseOptionalMembershipId(raw: string | undefined): MembershipId | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = membershipId.parse(raw);
  if (!parsed.ok) {
    throw Object.assign(new Error("Invalid membership id."), { code: parsed.code });
  }
  return parsed.value;
}

function parseOptionalInvitationId(raw: string | undefined): InvitationId | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = invitationId.parse(raw);
  if (!parsed.ok) {
    throw Object.assign(new Error("Invalid invitation id."), { code: parsed.code });
  }
  return parsed.value;
}

invitationsRoutes.post("/", requireUserActor, async (context) => {
  return handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const organizationId = parseOrganizationIdParam(
      requireRouteParam(context.req.param("organizationId"), "organizationId"),
    );
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
