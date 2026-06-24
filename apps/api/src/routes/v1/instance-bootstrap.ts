import { completeBootstrapOperatorClaim, getBootstrapStatus } from "@insecur/instance-bootstrap";
import { membershipId } from "@insecur/domain";
import {
  handleRoute,
  parseJsonBody,
  readRequiredString,
  requireUserActor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiEnv } from "../../env.js";

export const instanceBootstrapRoutes = new Hono<{
  Bindings: ApiEnv;
  Variables: AuthVariables;
}>();

function instanceIdFromEnv(env: ApiEnv): string {
  return env.INSTANCE_ID ?? "inst_LOCAL_DEV";
}

function parseOwnerMembershipId(body: Record<string, unknown>) {
  const parsed = membershipId.parse(readRequiredString(body, "ownerMembershipId"));
  if (!parsed.ok) {
    throw Object.assign(new Error("Invalid owner membership id."), {
      code: parsed.code,
    });
  }
  return parsed.value;
}

instanceBootstrapRoutes.get("/status", async (context) => {
  return handleRoute(context, async () => {
    return getBootstrapStatus(instanceIdFromEnv(context.env));
  });
});

instanceBootstrapRoutes.post("/operator-claim", requireUserActor, async (context) => {
  return handleRoute(context, async (reqId) => {
    const body = parseJsonBody(await context.req.json());

    return completeBootstrapOperatorClaim({
      instanceId: instanceIdFromEnv(context.env),
      actor: context.get("userActor"),
      bootstrapSecret: readRequiredString(body, "bootstrapSecret"),
      operatorGrantId: readRequiredString(body, "operatorGrantId"),
      ownerMembershipId: parseOwnerMembershipId(body),
      request: { requestId: reqId },
    });
  });
});
