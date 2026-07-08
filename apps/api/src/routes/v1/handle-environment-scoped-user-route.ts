import { handleRoute, runtimeClientFor, type AuthVariables } from "@insecur/worker-kit";
import type { RequestId } from "@insecur/domain";
import type { UserActor } from "@insecur/auth";
import type { Context } from "hono";
import type { ApiEnv } from "../../env.js";
import { parseEnvironmentScopedRouteParams } from "./parse-environment-scoped-route-params.js";

type EnvironmentScopedRouteContext = Context<{ Bindings: ApiEnv; Variables: AuthVariables }>;

export function handleEnvironmentScopedUserRoute<T>(
  context: EnvironmentScopedRouteContext,
  handler: (input: {
    readonly userActor: UserActor;
    readonly organizationId: ReturnType<typeof parseEnvironmentScopedRouteParams>["organizationId"];
    readonly projectId: ReturnType<typeof parseEnvironmentScopedRouteParams>["projectId"];
    readonly environmentId: ReturnType<typeof parseEnvironmentScopedRouteParams>["environmentId"];
    readonly requestId: RequestId;
  }) => Promise<T>,
) {
  return handleRoute(context, async (requestId) => {
    const userActor = context.get("userActor");
    const { organizationId, projectId, environmentId } = parseEnvironmentScopedRouteParams(context);

    return handler({
      userActor,
      organizationId,
      projectId,
      environmentId,
      requestId,
    });
  });
}

export function runtimeClientForEnvironmentScopedRoute(context: EnvironmentScopedRouteContext) {
  const userActor = context.get("userActor");
  return runtimeClientFor(context.env, userActor);
}
