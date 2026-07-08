import {
  handleRoute,
  parseGuidedOrganizationResourceIds,
  parseJsonBody,
  parseOptionalDisplayName,
  readOptionalString,
  requireUserActor,
  resolveInstanceId,
  runtimeClientFor,
  enforcePublicEdgeAbuseControl,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiApp, ApiEnv } from "../../env.js";

const onboardingRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

function optionalDisplayName(
  body: Record<string, unknown>,
  field:
    "organizationDisplayName" | "projectDisplayName" | "teamDisplayName" | "environmentDisplayName",
) {
  const displayName = parseOptionalDisplayName(readOptionalString(body, field));
  return displayName === undefined ? {} : { [field]: displayName };
}

onboardingRoutes.post("/personal-organization", requireUserActor, async (context) => {
  return handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    await enforcePublicEdgeAbuseControl(context.env, (name) => context.req.header(name), {
      target: "onboarding_guided_provision",
      requestId: reqId,
      actorUserId: userActor.userId,
    });

    const body = parseJsonBody(await context.req.json());
    const resourceIds = parseGuidedOrganizationResourceIds(body);

    return runtimeClientFor(context.env, userActor).provisionGuidedOrganization({
      instanceId: resolveInstanceId(context.env),
      ...optionalDisplayName(body, "organizationDisplayName"),
      ...optionalDisplayName(body, "projectDisplayName"),
      ...optionalDisplayName(body, "teamDisplayName"),
      ...optionalDisplayName(body, "environmentDisplayName"),
      ...(resourceIds !== undefined ? { resourceIds } : {}),
      requestId: reqId,
    });
  });
});

export function registerOnboardingRoutes(app: ApiApp): void {
  app.route("/v1/onboarding", onboardingRoutes);
}
