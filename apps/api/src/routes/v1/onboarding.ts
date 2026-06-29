import {
  handleRoute,
  parseGuidedOrganizationResourceIds,
  parseJsonBody,
  parseOptionalDisplayName,
  readOptionalString,
  requireUserActor,
  resolveInstanceId,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiEnv } from "../../env.js";
import { provisionGuidedOrganizationViaRuntime } from "../../rpc/runtime-onboarding-caller.js";

export const onboardingRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

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

    return provisionGuidedOrganizationViaRuntime(context.env, userActor, {
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
