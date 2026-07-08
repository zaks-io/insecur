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
  runtimeClientFor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiApp, ApiEnv } from "../../env.js";
import { parseOrganizationRouteParam } from "./parse-org-route-params.js";

const invitationsRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

// The console People pending-invitations read (INS-373), forwarded like every non-keyring DB read
// (ADR-0077). Metadata only: invitation envelopes carry no token or acceptance secret.
invitationsRoutes.get("/", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) =>
    runtimeClientFor(context.env, context.get("userActor")).listOrganizationInvitations({
      organizationId: parseOrganizationRouteParam(context),
      requestId: reqId,
    }),
  ),
);

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

    return runtimeClientFor(context.env, userActor).createInvitation({
      organizationId,
      inviteeUserId: parseUserIdField(readRequiredString(body, "inviteeUserId")),
      rolePreset: readRequiredString(body, "rolePreset"),
      ...(projectIdRaw !== undefined ? { projectId: parseProjectIdParam(projectIdRaw) } : {}),
      ...(invitationIdValue !== undefined ? { invitationId: invitationIdValue } : {}),
      ...(membershipIdValue !== undefined ? { membershipId: membershipIdValue } : {}),
      requestId: reqId,
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

    return runtimeClientFor(context.env, userActor).acceptInvitation({
      invitationId: invitationIdValue,
      organizationId,
      ...(membershipIdValue !== undefined ? { membershipId: membershipIdValue } : {}),
      requestId: reqId,
    });
  });
});

export function registerInvitationsRoutes(app: ApiApp): void {
  app.route("/v1/orgs/:organizationId/invitations", invitationsRoutes);
}
