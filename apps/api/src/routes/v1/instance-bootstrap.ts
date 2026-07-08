import {
  handleRoute,
  parseJsonBody,
  parseOwnerMembershipId,
  readRequiredString,
  requireUserActor,
  resolveInstanceId,
  runtimeClientFor,
  enforcePublicEdgeAbuseControl,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiApp, ApiEnv } from "../../env.js";
import { getBootstrapStatusViaRuntime } from "../../rpc/runtime-admission-caller.js";

export const instanceBootstrapRoutes = new Hono<{
  Bindings: ApiEnv;
  Variables: AuthVariables;
}>();

instanceBootstrapRoutes.get("/status", async (context) => {
  return handleRoute(context, async () => {
    return getBootstrapStatusViaRuntime(context.env);
  });
});

instanceBootstrapRoutes.post("/operator-claim", requireUserActor, async (context) => {
  return handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    await enforcePublicEdgeAbuseControl(context.env, (name) => context.req.header(name), {
      target: "bootstrap_operator_claim",
      requestId: reqId,
      actorUserId: userActor.userId,
    });

    const body = parseJsonBody(await context.req.json());

    return runtimeClientFor(context.env, context.get("userActor")).completeBootstrapOperatorClaim({
      instanceId: resolveInstanceId(context.env),
      bootstrapSecret: readRequiredString(body, "bootstrapSecret"),
      operatorGrantId: readRequiredString(body, "operatorGrantId"),
      ownerMembershipId: parseOwnerMembershipId(body),
      requestId: reqId,
    });
  });
});

export function registerInstanceBootstrapRoutes(app: ApiApp): void {
  app.route("/v1/instance/bootstrap", instanceBootstrapRoutes);
}
