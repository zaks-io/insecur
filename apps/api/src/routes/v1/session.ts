import { successEnvelope } from "@insecur/domain";
import { requireUserActor, type AuthVariables } from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiEnv } from "../../env.js";

export const sessionRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

sessionRoutes.get("/whoami", requireUserActor, (context) => {
  const actor = context.get("userActor");
  return context.json(
    successEnvelope({
      actorType: actor.type,
      userId: actor.userId,
      sessionId: actor.sessionId,
    }),
  );
});
