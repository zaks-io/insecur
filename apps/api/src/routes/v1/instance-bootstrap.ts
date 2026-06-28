import { completeBootstrapOperatorClaim, getBootstrapStatus } from "@insecur/instance-bootstrap";
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

export const instanceBootstrapRoutes = new Hono<{
  Bindings: ApiEnv;
  Variables: AuthVariables;
}>();

instanceBootstrapRoutes.get("/status", async (context) => {
  return handleRoute(context, async () => {
    return getBootstrapStatus(resolveInstanceId(context.env));
  });
});

instanceBootstrapRoutes.post("/operator-claim", requireUserActor, async (context) => {
  return handleRoute(context, async (reqId) => {
    const body = parseJsonBody(await context.req.json());

    return completeBootstrapOperatorClaim({
      instanceId: resolveInstanceId(context.env),
      actor: context.get("userActor"),
      bootstrapSecret: readRequiredString(body, "bootstrapSecret"),
      operatorGrantId: readRequiredString(body, "operatorGrantId"),
      ownerMembershipId: parseOwnerMembershipId(body),
      request: { requestId: reqId },
    });
  });
});
