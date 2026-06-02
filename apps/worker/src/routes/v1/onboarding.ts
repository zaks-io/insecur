import { provisionGuidedOrganization } from "@insecur/onboarding";
import { Hono } from "hono";
import { requireUserActor, type AuthVariables } from "../../auth/middleware.js";
import { handleRoute } from "../../http/handle-route.js";
import {
  parseGuidedOrganizationResourceIds,
  parseJsonBody,
  parseOptionalDisplayName,
  readOptionalString,
} from "../../http/parse-route-input.js";
import type { WorkerEnv } from "../../env.js";

export const onboardingRoutes = new Hono<{ Bindings: WorkerEnv; Variables: AuthVariables }>();

function optionalDisplayName(
  body: Record<string, unknown>,
  field:
    | "organizationDisplayName"
    | "projectDisplayName"
    | "teamDisplayName"
    | "environmentDisplayName",
) {
  const displayName = parseOptionalDisplayName(readOptionalString(body, field));
  return displayName === undefined ? {} : { [field]: displayName };
}

onboardingRoutes.post("/personal-organization", requireUserActor, async (context) => {
  return handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    const body = parseJsonBody(await context.req.json());
    const resourceIds = parseGuidedOrganizationResourceIds(body);

    return provisionGuidedOrganization({
      userId: userActor.userId,
      instanceId: context.env.INSTANCE_ID ?? "inst_LOCAL_DEV",
      isAdmitted: true,
      ...optionalDisplayName(body, "organizationDisplayName"),
      ...optionalDisplayName(body, "projectDisplayName"),
      ...optionalDisplayName(body, "teamDisplayName"),
      ...optionalDisplayName(body, "environmentDisplayName"),
      ...(resourceIds !== undefined ? { resourceIds } : {}),
      request: { requestId: reqId },
    });
  });
});
