import {
  handleRoute,
  parseJsonBody,
  parseOwnerMembershipId,
  readRequiredString,
  requireUserActor,
  resolveInstanceId,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiEnv } from "../../env.js";
import { getBootstrapStatusViaRuntime } from "../../rpc/runtime-admission-caller.js";
import { completeBootstrapClaimViaRuntime } from "../../rpc/runtime-onboarding-caller.js";

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
    const body = parseJsonBody(await context.req.json());

    return completeBootstrapClaimViaRuntime(context.env, context.get("userActor"), {
      instanceId: resolveInstanceId(context.env),
      bootstrapSecret: readRequiredString(body, "bootstrapSecret"),
      operatorGrantId: readRequiredString(body, "operatorGrantId"),
      ownerMembershipId: parseOwnerMembershipId(body),
      requestId: reqId,
    });
  });
});
